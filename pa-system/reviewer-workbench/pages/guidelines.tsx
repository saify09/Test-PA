import React, { useState } from 'react';
import type { NextPage } from 'next';
import Head from 'next/head';
import Layout from '../components/layout/Layout';
import { Card } from '../components/ui';
import { Search, BookOpen, ChevronRight, ExternalLink, CheckCircle, Tag } from 'lucide-react';
import { cn } from '../lib/utils';

const CATEGORIES = ['All', 'Imaging', 'Surgery', 'Medication', 'Behavioral Health', 'DME', 'Therapy'];

const GUIDELINES = [
  {
    id: 'mcg-back-imaging',
    title: 'Low Back Pain — Imaging Studies',
    source: 'MCG Care Guidelines',
    edition: '28th Edition, 2026',
    category: 'Imaging',
    icd10: ['M54.5', 'M51.16', 'M54.4'],
    cpt: ['72148', '72141', '72157'],
    summary: 'MRI lumbar spine is indicated when: (1) conservative treatment ≥6 weeks has failed, (2) neurological deficits present, (3) suspicion of serious pathology (tumor, fracture, infection).',
    mustMeet: [
      'Conservative care ≥6 weeks documented (PT, NSAIDs, activity modification)',
      'Persistent or worsening symptoms despite conservative care',
      'Plain X-rays performed and non-diagnostic (for non-emergency cases)',
    ],
    shouldMeet: [
      'Radiculopathy symptoms with positive straight-leg raise',
      'Functional limitation affecting ADLs',
      'Failed response to ≥2 different conservative treatments',
    ],
    exclusions: [
      'Emergency indications (cauda equina syndrome) — auto-approve',
      'Prior MRI within 6 months without interval change in symptoms',
      'Post-surgical without new symptoms',
    ],
    tags: ['Routine', 'Common'],
  },
  {
    id: 'mcg-knee-arthroplasty',
    title: 'Total Knee Arthroplasty',
    source: 'MCG Care Guidelines',
    edition: '28th Edition, 2026',
    category: 'Surgery',
    icd10: ['M17.11', 'M17.12', 'M17.31'],
    cpt: ['27447', '27446'],
    summary: 'Total knee replacement is appropriate for severe knee osteoarthritis when functional limitation is significant and conservative therapies have been exhausted.',
    mustMeet: [
      'Radiographic evidence of moderate-to-severe osteoarthritis (Kellgren-Lawrence grade 3-4)',
      'Functional limitation with documented impact on daily activities',
      'Conservative treatment ≥3 months (PT, NSAIDs, corticosteroid injections)',
    ],
    shouldMeet: [
      'Age-appropriate candidate (typically ≥45 years)',
      'BMI documented; if >40, weight management counseling provided',
      'Smoking cessation if applicable',
    ],
    exclusions: [
      'Active infection (local or systemic)',
      'Non-compliant with prior treatment',
      'Significant comorbidities precluding surgery',
    ],
    tags: ['Surgical', 'High Cost'],
  },
  {
    id: 'interqual-adalimumab',
    title: 'Adalimumab (Humira) — Rheumatoid Arthritis',
    source: 'InterQual Criteria',
    edition: '2026 Update',
    category: 'Medication',
    icd10: ['M06.00', 'M06.01', 'M06.09'],
    cpt: ['J0135'],
    summary: 'Biologic DMARD therapy with adalimumab requires failure of conventional DMARD therapy and documented moderate-to-severe disease activity.',
    mustMeet: [
      'Diagnosis of moderate-to-severe RA confirmed by rheumatologist',
      'Failure of ≥2 conventional DMARDs (methotrexate required unless contraindicated)',
      'Disease Activity Score (DAS28 >3.2) or equivalent documented',
    ],
    shouldMeet: [
      'TB screening (IGRA/PPD) performed and negative within 12 months',
      'Hepatitis B screening performed',
      'No concurrent use of other biologics',
    ],
    exclusions: [
      'Active TB or serious infection',
      'Congestive heart failure (NYHA class III/IV)',
      'Lymphoma or other malignancies (within 5 years)',
    ],
    tags: ['Specialty Drug', 'Step Therapy'],
  },
  {
    id: 'cms-mri-spine',
    title: 'Spinal Imaging — Medicare NCD',
    source: 'CMS National Coverage Determination',
    edition: 'NCD 220.5, 2025',
    category: 'Imaging',
    icd10: ['M54.5', 'M48.06', 'M47.816'],
    cpt: ['72148', '72141', '72158'],
    summary: 'Medicare covers spinal MRI when specific clinical criteria are met per NCD 220.5.',
    mustMeet: [
      'Written order from treating physician',
      'Clinical indication documented in medical record',
      'Meets one of: radiculopathy, myelopathy, or failed conservative care',
    ],
    shouldMeet: [
      'Ordering physician reviewed prior imaging if available',
      'Non-contrast unless specific clinical need for contrast documented',
    ],
    exclusions: [
      'Screening without clinical indication',
      'Contraindication to MRI (pacemaker, ferromagnetic implant)',
    ],
    tags: ['Medicare', 'Imaging'],
  },
  {
    id: 'mcg-physical-therapy',
    title: 'Physical Therapy — Musculoskeletal',
    source: 'MCG Care Guidelines',
    edition: '28th Edition, 2026',
    category: 'Therapy',
    icd10: ['M54.5', 'M75.1', 'M17.11'],
    cpt: ['97110', '97012', '97140'],
    summary: 'Physical therapy is appropriate for musculoskeletal conditions when functional goals are achievable and documented.',
    mustMeet: [
      'Physician referral or order',
      'Documented functional limitations and treatment goals',
      'Reasonable expectation of improvement within treatment period',
    ],
    shouldMeet: [
      'Initial evaluation by PT completed',
      'Frequency and duration appropriate for condition',
      'Progress notes demonstrating measurable improvement',
    ],
    exclusions: [
      'No reasonable expectation of functional improvement',
      'Condition requiring medical or surgical management first',
    ],
    tags: ['Common', 'Outpatient'],
  },
];

const GuidelinesPage: NextPage = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<typeof GUIDELINES[0] | null>(null);

  const filtered = GUIDELINES.filter(g => {
    const matchCat = category === 'All' || g.category === category;
    const matchSearch = !search || g.title.toLowerCase().includes(search.toLowerCase()) ||
      g.icd10.some(c => c.toLowerCase().includes(search.toLowerCase())) ||
      g.cpt.some(c => c.toLowerCase().includes(search.toLowerCase())) ||
      g.summary.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <>
      <Head><title>Clinical Guidelines | Reviewer Workbench</title></Head>
      <Layout title="Clinical Guidelines">
        <div className="flex gap-4 h-[calc(100vh-120px)]">
          {/* Left: list */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Search guidelines, ICD-10, CPT…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
              />
            </div>
            {/* Category filter */}
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={cn('px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                    category === c ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  )}>
                  {c}
                </button>
              ))}
            </div>
            {/* Guidelines list */}
            <div className="flex-1 overflow-y-auto space-y-1.5">
              {filtered.map(g => (
                <div
                  key={g.id}
                  onClick={() => setSelected(g)}
                  className={cn(
                    'p-3 rounded-xl border cursor-pointer transition-all',
                    selected?.id === g.id
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{g.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{g.source}</p>
                    </div>
                    <ChevronRight size={14} className={cn('flex-shrink-0 mt-0.5', selected?.id === g.id ? 'text-blue-500' : 'text-gray-300')} />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {g.tags.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-medium">{t}</span>
                    ))}
                  </div>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {g.icd10.slice(0, 2).map(c => <span key={c} className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1 rounded">{c}</span>)}
                    {g.cpt.slice(0, 2).map(c => <span key={c} className="font-mono text-[10px] text-green-600 bg-green-50 px-1 rounded">{c}</span>)}
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-12 text-sm text-gray-400">No guidelines match your search</div>
              )}
            </div>
          </div>

          {/* Right: detail */}
          <div className="flex-1 overflow-y-auto">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <BookOpen size={40} className="text-gray-200 mb-3" />
                <p className="text-base font-semibold text-gray-400">Select a guideline to view details</p>
                <p className="text-sm text-gray-300 mt-1">Search or browse by category on the left</p>
              </div>
            ) : (
              <div className="card space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{selected.title}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{selected.source} — {selected.edition}</p>
                  </div>
                  <button className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline flex-shrink-0">
                    <ExternalLink size={13} /> Full Guideline
                  </button>
                </div>

                {/* Codes */}
                <div className="flex gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Applicable ICD-10 Codes</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {selected.icd10.map(c => <span key={c} className="font-mono text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">{c}</span>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1.5">Applicable CPT Codes</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {selected.cpt.map(c => <span key={c} className="font-mono text-sm font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-lg">{c}</span>)}
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Summary</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{selected.summary}</p>
                </div>

                {/* Must meet */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-red-100 text-red-600 text-[10px] flex items-center justify-center font-bold">!</span>
                    Must Meet ALL (Mandatory Criteria)
                  </p>
                  <div className="space-y-2">
                    {selected.mustMeet.map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Should meet */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-blue-100 text-blue-600 text-[10px] flex items-center justify-center font-bold">+</span>
                    Should Meet (Supporting Criteria)
                  </p>
                  <div className="space-y-2">
                    {selected.shouldMeet.map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Exclusions */}
                <div>
                  <p className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-orange-100 text-orange-600 text-[10px] flex items-center justify-center font-bold">⚠</span>
                    Exclusion Criteria (Red Flags)
                  </p>
                  <div className="space-y-2">
                    {selected.exclusions.map((item, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <div className="w-3.5 h-3.5 rounded-full bg-orange-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                  {selected.tags.map(t => (
                    <span key={t} className="flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                      <Tag size={10} /> {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>
    </>
  );
};

export default GuidelinesPage;
