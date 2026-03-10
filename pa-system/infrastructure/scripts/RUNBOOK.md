# PA System — Operations Runbook

## Service Map

| Service | Port | Replicas | Health Check |
|---|---|---|---|
| AI Engine | 8001 | 2–8 | `GET /health` |
| Intake Service | 8002 | 3–12 | `GET /health` |
| Payer Integration | 8003 | 2–6 | `GET /health` |
| Appeals Service | 8004 | 2–6 | `GET /health` |
| Notification Service | 8005 | 2–4 | `GET /health` |
| Document Service | 8006 | 2–6 | `GET /health` |

## Quick Commands

```bash
# Cluster status
kubectl get pods -n pa-system
kubectl top pods -n pa-system

# Follow AI engine logs
kubectl logs -f -l app=ai-engine -n pa-system --all-containers

# Scale manually
kubectl scale deployment ai-engine --replicas=4 -n pa-system

# Force restart
kubectl rollout restart deployment/intake-service -n pa-system

# Check HPA status
kubectl get hpa -n pa-system

# SLA at-risk cases (direct query)
kubectl exec -n pa-system deployment/ai-engine -- \
  psql $DATABASE_URL -c \
  "SELECT pa_number, urgency, sla_deadline FROM pa.cases WHERE sla_deadline < NOW() + INTERVAL '4 hours' AND status IN ('SUBMITTED','IN_REVIEW');"
```

## Rollback Procedure

```bash
# Helm rollback
helm history pa-system -n pa-system
helm rollback pa-system <REVISION> -n pa-system --wait

# Single service rollback
kubectl rollout undo deployment/ai-engine -n pa-system
kubectl rollout status deployment/ai-engine -n pa-system
```

## HIPAA Incident Response

1. **Detect** — Alert fires (`UnusualPHIAccessRate` or `MultipleFailedLogins`)
2. **Contain** — `kubectl cordon <node>` to isolate; revoke API keys via Kong admin
3. **Assess** — Query audit log:
   ```sql
   SELECT user_name_enc, action, ip_address, timestamp, phi_fields
   FROM audit.logs
   WHERE timestamp > NOW() - INTERVAL '1 hour'
     AND phi_accessed = TRUE
   ORDER BY timestamp DESC LIMIT 200;
   ```
4. **Notify** — If breach confirmed: notify HIPAA Privacy Officer within 1 hour; notify HHS within 60 days
5. **Remediate** — Rotate secrets: `kubectl create secret generic pa-secrets --from-env-file=.env -n pa-system --dry-run=client -o yaml | kubectl apply -f -`
6. **Document** — Create incident record in audit system; preserve all logs for minimum 6 years

## Kafka Topic Management

```bash
# List topics
kubectl exec -n pa-system kafka-0 -- \
  kafka-topics.sh --bootstrap-server localhost:9092 --list

# Check consumer group lag
kubectl exec -n pa-system kafka-0 -- \
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group pa-ai-engine

# Reset consumer offset (use with extreme caution)
kubectl exec -n pa-system kafka-0 -- \
  kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group pa-ai-engine --topic pa-submissions \
  --reset-offsets --to-earliest --execute
```

## Database Maintenance

```bash
# Connect to RDS
kubectl run psql-client --rm -it --restart=Never \
  --image=postgres:16-alpine \
  --env="PGPASSWORD=$DB_PASSWORD" \
  -- psql -h $RDS_ENDPOINT -U pauser -d pa_system

# Vacuum analyze (run during low-traffic window)
VACUUM ANALYZE pa.cases;
VACUUM ANALYZE pa.decisions;

# Check slow queries
SELECT query, calls, total_exec_time/calls AS avg_ms, rows/calls AS avg_rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;

# Check partition sizes
SELECT schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'cases_%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## SLA Recovery Playbook

If SLA compliance drops below 95%:

1. Check reviewer queue depth: `kubectl logs -l app=ai-engine -n pa-system | grep queue_depth`
2. Temporarily lower AI auto-approve threshold:
   ```bash
   kubectl set env deployment/ai-engine AUTO_APPROVE_THRESHOLD=0.88 -n pa-system
   ```
3. Scale reviewer workbench pods for more concurrent sessions
4. Alert on-call Medical Director for expedited review
5. Restore threshold after backlog clears

## Certificate Renewal

```bash
# Check cert expiry
kubectl get certificate -n pa-system
kubectl describe certificate pa-system-tls -n pa-system

# Force renewal (cert-manager)
kubectl delete certificaterequest -n pa-system --all
```
