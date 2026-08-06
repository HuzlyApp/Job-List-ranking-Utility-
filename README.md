# Zip Staff MSP Requisition Intelligence & Profitability Utility

A production-ready staffing decision-support platform that transforms MSP/VMS requisition screenshots and spreadsheets into a ranked, deduplicated, financially evaluated recruiting dashboard.

## Overview

This system helps recruiters determine which requisitions to pursue before spending recruiter time, sourcing effort, or advertising budget. It answers:

1. Which requisitions are realistically fillable?
2. Which requisitions should Zip Staff pursue first?
3. What W-2 pay range is competitive for each role?
4. What will the role approximately cost Zip Staff?
5. What profit can Zip Staff expect per hour, week, and assignment?
6. Which jobs should be skipped, monitored, or worked only when an existing candidate is available?

## Technical Stack

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS
- **Database**: Neon Postgres
- **ORM**: Drizzle ORM
- **AI**: xAI Grok (OpenAI-compatible API) via centralized server-side provider
- Financial calculations, ranking, and Excel generation remain deterministic on the server
- **File Parsing**: xlsx (Excel), exceljs (Export)
- **Validation**: Zod

## Features

### Core Functionality

- **Multi-format Upload**: Support for PNG, JPG, JPEG, WEBP images and XLSX, XLS, CSV spreadsheets
- **AI-Powered Extraction**: Grok extracts requisition data from screenshots; spreadsheets parse locally
- **Smart Deduplication**: Merges duplicate requisitions by Requisition ID
- **Financial Calculations**: Deterministic calculations for profit, margin, and costs
- **Scoring System**: Weighted opportunity scores based on competition, profitability, fillability, bill rate, and duration
- **Recommendations**: Automated recommendations with manual override support
- **Historical Tracking**: Change detection and history snapshots
- **Export**: Excel and CSV exports with professional formatting

### Financial Engine

Calculates:
- Effective vendor rate (with MSP fee deduction)
- Gross spread per hour
- W-2 cost per hour (including FICA, workers comp, insurance, recruiting, overhead)
- Estimated profit per hour
- Net margin percentage
- Weekly profit
- Assignment profit (based on duration)

### Scoring Components

- **Competition Score**: Based on submission count (0-100)
- **Profitability Score**: Based on profit per hour (0-100)
- **Fillability Score**: AI-estimated based on role specialization (0-100)
- **Bill Rate Score**: Based on effective vendor rate (0-100)
- **Duration Score**: Based on assignment length (0-100)

### Role Risk Classifications

- **Standard**: IT, Admin, Business Analysis, Software Development ($0.30/hr workers comp)
- **Higher-Risk Technical**: Field Engineering, Controls, Manufacturing ($0.60/hr workers comp)
- **Healthcare**: Requires manual review for workers comp rate

## Database Schema

### Core Tables

- `tenants`: Multi-tenant organization data
- `users`: System users with role-based access
- `msp_programs`: MSP program configurations and fee structures
- `financial_assumption_sets`: Versioned cost assumptions
- `scoring_weights`: Configurable scoring weights
- `requisition_analysis_batches`: Upload batches with processing status
- `requisition_source_files`: Uploaded file metadata
- `requisition_source_rows`: Extracted rows before deduplication
- `requisitions`: Authoritative requisition records
- `requisition_analysis_results`: Current financial and scoring results
- `requisition_snapshots`: Historical snapshots
- `requisition_overrides`: Manual override audit trail
- `audit_logs`: Comprehensive action logging
- `customer_aliases`: Customer name normalization

## API Routes

### Batches
- `GET /api/batches` - List batches
- `POST /api/batches` - Create new batch
- `POST /api/batches/[id]` - Process batch (extract, finalize, status)
- `PATCH /api/batches/[id]` - Update extracted rows

### Requisitions
- `GET /api/requisitions` - List requisitions with filtering
- `GET /api/requisitions/[id]` - Get requisition details with history
- `PATCH /api/requisitions/[id]` - Update requisition
- `POST /api/requisitions/[id]` - Create override

### Export
- `GET /api/export` - Export to Excel or CSV

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# AI Provider (xAI Grok — server-side only)
XAI_API_KEY=xai-...
GROK_BASE_URL=https://api.x.ai/v1
GROK_MODEL=grok-4.5
GROK_TIMEOUT_MS=120000
GROK_MAX_RETRIES=2

# Pay-analysis performance (preferred)
XAI_ANALYSIS_MODE=fast
XAI_ANALYSIS_FAST_MODEL=grok-4.20-0309-non-reasoning
XAI_ANALYSIS_QUALITY_MODEL=grok-4.5
# XAI_ANALYSIS_MODEL=   # optional hard override; invalid names fail loudly
XAI_ANALYSIS_CONCURRENCY=3
XAI_ANALYSIS_CHUNK_SIZE=10
XAI_ANALYSIS_MAX_OUTPUT_TOKENS=1600
XAI_ANALYSIS_TIMEOUT_MS=120000

# Neon (for MCP)
NEON_API_KEY=napi_...
NEON_AUTH_BASE_URL=https://...
NEON_AUTH_COOKIE_SECRET=...
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env`

3. Run database migrations:
```bash
npx tsx scripts/migrate.ts
```

4. Start development server:
```bash
npm run dev
```

## Usage Workflow

1. **Create Batch**: User creates a new requisition analysis batch
2. **Upload Files**: Upload screenshots and/or spreadsheets
3. **Extract**: AI extracts requisition data from files
4. **Review**: User reviews and corrects extracted data
5. **Finalize**: System deduplicates, calculates financials, and assigns scores
6. **Dashboard**: View ranked requisitions with recommendations
7. **Export**: Download Excel or CSV for further analysis

## File Upload Support

### Images
- PNG, JPG, JPEG, WEBP
- Multiple images in single batch
- Overlapping rows handled
- Partial visibility supported

### Spreadsheets
- XLSX, XLS, CSV
- Automatic header detection
- Column name normalization
- Duplicate row handling

## Financial Assumptions (Default)

### MSP Fee
- Vendor deduction: 2% (configurable)
- Weekly hours: 40 (configurable)

### Employer Costs
- FICA: 7.65%
- FUTA/SUTA: $0.45/hr
- Standard workers comp: $0.30/hr
- High-risk workers comp: $0.60/hr
- Payroll processing: $0.25/hr
- Background/compliance: $0.20/hr
- Insurance: $0.25/hr
- Recruiting: $1.25/hr
- Overhead: $0.75/hr
- Benefits/PTO: $0.00/hr (configurable)

## Scoring Weights (Default)

- Competition: 30%
- Profitability: 25%
- Fillability: 20%
- Bill Rate: 15%
- Duration: 10%

## Recommendations

| Score Range | Recommendation |
|-------------|----------------|
| 90-100 | Recruit Immediately |
| 80-89 | High Priority |
| 70-79 | Good Opportunity |
| 60-69 | Candidate Driven |
| 50-59 | Only If Candidate Available |
| Below 50 | Skip or Monitor |

## Security

- Multi-tenant data isolation
- Role-based access control
- Audit logging for all actions
- File upload validation
- SQL injection prevention via Drizzle ORM
- XSS prevention via React
- CSRF protection

## Testing

Run tests:
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e
```

## Deployment

### Build
```bash
npm run build
```

### Production Start
```bash
npm start
```

## Architecture Decisions

### Why Deterministic Calculations?
All financial calculations are performed in application code, not by AI. This ensures:
- Consistent results
- Auditable calculations
- No hallucinated financials
- Version control of assumptions

### Why Separate Tables for Results?
- Current results in `requisition_analysis_results`
- Historical snapshots in `requisition_snapshots`
- Enables trend analysis and change detection
- Supports reproducibility

### Why Two-Phase Processing?
1. Extract raw data
2. Review and deduplicate
3. Calculate financials
4. This allows human review before finalization

## Known Limitations

- Image OCR requires a vision-capable Grok model (`GROK_MODEL`) and xAI API credits
- Large batches may take time to process
- Healthcare workers comp requires manual configuration
- Some edge cases in duration parsing

## Future Enhancements

- Additional AI provider support (future providers as needed)
- Real-time collaboration
- Advanced filtering and saved views
- Integration with ATS systems
- Email notifications
- Mobile app

## Support

For issues or questions, contact the development team.

## License

Proprietary - Zip Staff
