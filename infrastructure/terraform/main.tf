# ============================================================
# Terraform — PA System AWS Infrastructure
# Provisions: VPC, EKS, RDS PostgreSQL, ElastiCache Redis,
#             MSK Kafka, S3 (HIPAA), WAF, ACM, Route53
# ============================================================

terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.27"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
  }
  backend "s3" {
    bucket         = "pa-system-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "pa-system-tf-locks"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "PA-System"
      Environment = var.environment
      ManagedBy   = "Terraform"
      HIPAA       = "true"
      Owner       = "platform-team"
    }
  }
}

# ── Variables ─────────────────────────────────────────────────────────────────
variable "aws_region"           { default = "us-east-1" }
variable "environment"          { default = "production" }
variable "project"              { default = "pa-system" }
variable "vpc_cidr"             { default = "10.0.0.0/16" }
variable "eks_cluster_version"  { default = "1.29" }
variable "db_instance_class"    { default = "db.r6g.xlarge" }
variable "db_allocated_storage" { default = 200 }
variable "db_password"          { sensitive = true }
variable "redis_node_type"      { default = "cache.r6g.large" }
variable "kafka_broker_type"    { default = "kafka.m5.large" }
variable "domain_name"          { default = "pa-system.health" }

locals {
  name_prefix = "${var.project}-${var.environment}"
  azs         = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
}

# ── VPC ───────────────────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.5"

  name = "${local.name_prefix}-vpc"
  cidr = var.vpc_cidr

  azs              = local.azs
  private_subnets  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets   = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  database_subnets = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = false    # HA: one per AZ
  enable_vpn_gateway     = false
  enable_dns_hostnames   = true
  enable_dns_support     = true

  # HIPAA: all traffic flows through private subnets
  private_subnet_tags = {
    "kubernetes.io/cluster/${local.name_prefix}-eks" = "owned"
    "kubernetes.io/role/internal-elb"                 = "1"
  }
  public_subnet_tags = {
    "kubernetes.io/cluster/${local.name_prefix}-eks" = "shared"
    "kubernetes.io/role/elb"                          = "1"
  }
}

# ── EKS Cluster ───────────────────────────────────────────────────────────────
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.8"

  cluster_name    = "${local.name_prefix}-eks"
  cluster_version = var.eks_cluster_version

  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  cluster_endpoint_public_access = false   # HIPAA: private endpoint only
  cluster_endpoint_private_access= true

  cluster_addons = {
    coredns    = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni    = { most_recent = true }
    aws-ebs-csi-driver = { most_recent = true }
  }

  # Managed node groups
  eks_managed_node_groups = {
    # General workload
    general = {
      name           = "${local.name_prefix}-general"
      instance_types = ["m6i.xlarge"]
      min_size       = 2
      max_size       = 8
      desired_size   = 3
      disk_size      = 100
      labels = { workload = "general" }
    }
    # AI inference (higher memory)
    ai = {
      name           = "${local.name_prefix}-ai"
      instance_types = ["r6i.2xlarge"]
      min_size       = 1
      max_size       = 4
      desired_size   = 2
      disk_size      = 100
      labels = { workload = "ai-inference" }
      taints = [{
        key    = "workload"
        value  = "ai-inference"
        effect = "NO_SCHEDULE"
      }]
    }
  }

  # HIPAA: encrypt secrets at rest
  cluster_encryption_config = {
    provider_key_arn = aws_kms_key.eks.arn
    resources        = ["secrets"]
  }
}

# ── KMS Keys ──────────────────────────────────────────────────────────────────
resource "aws_kms_key" "eks" {
  description             = "EKS secrets encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

resource "aws_kms_key" "rds" {
  description             = "RDS at-rest encryption (HIPAA)"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

resource "aws_kms_key" "s3" {
  description             = "S3 PHI documents encryption (HIPAA)"
  deletion_window_in_days = 7
  enable_key_rotation     = true
}

# ── RDS PostgreSQL 16 ─────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet"
  subnet_ids = module.vpc.database_subnets
}

resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "PA System RDS access"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier        = "${local.name_prefix}-postgres"
  engine            = "postgres"
  engine_version    = "16.2"
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true
  kms_key_id        = aws_kms_key.rds.arn

  db_name  = "pa_system"
  username = "pauser"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = true      # HIPAA: HA required
  publicly_accessible    = false

  backup_retention_period = 35       # HIPAA: 35-day backup
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:30-sun:05:30"
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "${local.name_prefix}-final-snapshot"

  performance_insights_enabled          = true
  performance_insights_retention_period = 731  # 2 years
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  parameters = [{
    name  = "log_connections"
    value = "1"
  }, {
    name  = "log_disconnections"
    value = "1"
  }, {
    name  = "log_duration"
    value = "1"
  }, {
    name  = "ssl"
    value = "1"
  }]
}

# Read replica
resource "aws_db_instance" "postgres_replica" {
  identifier             = "${local.name_prefix}-postgres-replica"
  replicate_source_db    = aws_db_instance.postgres.identifier
  instance_class         = var.db_instance_class
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.rds.arn
  publicly_accessible    = false
  auto_minor_version_upgrade = false
  performance_insights_enabled = true
  monitoring_interval    = 60
  monitoring_role_arn    = aws_iam_role.rds_monitoring.arn
  vpc_security_group_ids = [aws_security_group.rds.id]
}

resource "aws_iam_role" "rds_monitoring" {
  name               = "${local.name_prefix}-rds-monitoring"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
    }]
  })
}
resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ── ElastiCache Redis 7 ───────────────────────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis-subnet"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "redis" {
  name   = "${local.name_prefix}-redis-sg"
  vpc_id = module.vpc.vpc_id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.eks.cluster_security_group_id]
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${local.name_prefix}-redis"
  description                = "PA System Redis — session cache & pub/sub"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 3      # 1 primary + 2 replicas
  port                       = 6379
  parameter_group_name       = "default.redis7"
  engine_version             = "7.1"
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.db_password  # Reuse strong password var
  auto_minor_version_upgrade = true
  snapshot_retention_limit   = 7
  snapshot_window            = "03:00-04:00"
}

# ── S3 — HIPAA PHI Documents ──────────────────────────────────────────────────
resource "aws_s3_bucket" "documents" {
  bucket        = "${local.name_prefix}-documents-hipaa"
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    id     = "hipaa-retention"
    status = "Enabled"
    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
    transition {
      days          = 365
      storage_class = "GLACIER"
    }
    expiration {
      days = 2557  # 7 years HIPAA retention
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# ── Outputs ───────────────────────────────────────────────────────────────────
output "eks_cluster_name"     { value = module.eks.cluster_name }
output "eks_cluster_endpoint" { value = module.eks.cluster_endpoint }
output "rds_endpoint"         { value = aws_db_instance.postgres.endpoint }
output "redis_endpoint"       { value = aws_elasticache_replication_group.redis.primary_endpoint_address }
output "s3_bucket_name"       { value = aws_s3_bucket.documents.bucket }
output "vpc_id"               { value = module.vpc.vpc_id }
