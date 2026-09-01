import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { SystemForm } from './_components/system-form';

export default function SystemPage() {
  return (
    <main className='mx-auto w-full max-w-container-max p-gutter bg-[var(--surface-canvas)]'>
      <div className='grid grid-cols-1 xl:grid-cols-12 gap-gutter'>
        <div className='xl:col-span-8 flex flex-col gap-gutter'>
          <div className='flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pb-4 border-b border-[var(--border-subtle)]'>
            <div>
              <h1 className='headline-xl text-[var(--on-surface)]'>System Status &amp; Webhooks</h1>
              <p className='body-md text-[var(--on-surface-variant)] mt-1'>
                Real-time monitoring of API integrations and webhook delivery performance.
              </p>
            </div>
            <div
              className='flex items-center gap-2 bg-[var(--surface-container-low)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 shrink-0'
              role='status'
              aria-label='All Systems Operational'
            >
              <span className='w-2.5 h-2.5 rounded-full bg-[var(--success-status)] animate-pulse' aria-hidden='true' />
              <span className='data-mono text-[var(--success-status)]'>All Systems Operational</span>
            </div>
          </div>

          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <Card className='bg-[var(--surface-container-lowest)] border-[var(--border-subtle)] rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group'>
              <div className='absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity' aria-hidden='true'>
                <span className='material-symbols-outlined text-6xl text-[var(--primary)]'>api</span>
              </div>
              <h3 className='label-caps text-[var(--on-surface-variant)] mb-2'>Core API Uptime</h3>
              <div className='flex items-end gap-2'>
                <span className='headline-xl text-[var(--on-surface)]'>99.99%</span>
                <span className='body-sm text-[var(--success-status)] mb-1 flex items-center' aria-hidden='true'>
                  <span className='material-symbols-outlined text-sm'>trending_up</span>
                </span>
              </div>
              <p className='body-sm text-[var(--on-surface-variant)] mt-2'>Last 30 days. Avg latency 42ms.</p>
            </Card>

            <Card className='bg-[var(--surface-container-lowest)] border-[var(--border-subtle)] rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group'>
              <div className='absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity' aria-hidden='true'>
                <span className='material-symbols-outlined text-6xl text-[var(--primary)]'>database</span>
              </div>
              <h3 className='label-caps text-[var(--on-surface-variant)] mb-2'>Ledger DB Status</h3>
              <div className='flex items-end gap-2'>
                <span className='headline-xl text-[var(--on-surface)]'>Healthy</span>
              </div>
              <div className='w-full bg-[var(--surface-container)] h-1.5 rounded-full mt-3 overflow-hidden' role='progressbar' aria-valuenow={15} aria-valuemin={0} aria-valuemax={100} aria-label='Ledger DB capacity 15%'>
                <div className='bg-[var(--success-status)] h-full w-[15%]' />
              </div>
              <p className='body-sm text-[var(--on-surface-variant)] mt-1'>15% capacity utilized.</p>
            </Card>

            <Card className='bg-[var(--surface-container-lowest)] border-[var(--border-subtle)] rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group'>
              <div className='absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity' aria-hidden='true'>
                <span className='material-symbols-outlined text-6xl text-[var(--pending-status)]'>queue</span>
              </div>
              <h3 className='label-caps text-[var(--on-surface-variant)] mb-2'>Webhook Queue Depth</h3>
              <div className='flex items-end gap-2'>
                <span className='headline-xl text-[var(--pending-status)]'>142</span>
                <span className='body-sm text-[var(--on-surface-variant)] mb-1'>events</span>
              </div>
              <p className='body-sm text-[var(--on-surface-variant)] mt-2'>Processing normal. Est delay &lt; 1s.</p>
            </Card>
          </div>

          <Card className='bg-[var(--surface-container-lowest)] border-[var(--border-subtle)] rounded-xl p-6 shadow-sm'>
            <div className='flex justify-between items-center mb-6'>
              <h3 className='headline-md text-[var(--on-surface)]'>Webhook Delivery Traffic (Last 24h)</h3>
              <div className='flex gap-3'>
                <span className='flex items-center gap-1 body-sm text-[var(--on-surface-variant)]'>
                  <span className='w-2 h-2 rounded-full bg-[var(--success-status)]' aria-hidden='true' /> Success
                </span>
                <span className='flex items-center gap-1 body-sm text-[var(--on-surface-variant)]'>
                  <span className='w-2 h-2 rounded-full bg-[var(--failed-status)]' aria-hidden='true' /> Failed
                </span>
              </div>
            </div>
            <div className='h-48 w-full flex items-end gap-1 border-b border-[var(--border-subtle)] pb-1 relative'>
              <div className='absolute left-0 top-0 h-full flex flex-col justify-between label-caps text-[var(--outline-variant)] pb-1 pr-2 border-r border-[var(--border-subtle)] w-8' aria-hidden='true'>
                <span>1k</span>
                <span>500</span>
                <span>0</span>
              </div>
              <div className='flex-1 flex items-end gap-1 md:gap-2 ml-10 h-full'>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '5%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '40%' }} /></div>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '2%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '35%' }} /></div>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '0%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '30%' }} /></div>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '10%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '50%' }} /></div>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '1%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '60%' }} /></div>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '5%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '80%' }} /></div>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '20%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '45%' }} /></div>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '2%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '55%' }} /></div>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '0%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '65%' }} /></div>
                <div className='flex-1 flex flex-col justify-end gap-px h-full'><div className='w-full bg-[var(--failed-status)] opacity-80' style={{ height: '3%' }} /><div className='w-full bg-[var(--success-status)] opacity-80' style={{ height: '40%' }} /></div>
              </div>
            </div>
            <div className='flex justify-between mt-2 label-caps text-[var(--outline-variant)] ml-10' aria-hidden='true'>
              <span>12:00 AM</span>
              <span>06:00 AM</span>
              <span>12:00 PM</span>
              <span>06:00 PM</span>
              <span>Now</span>
            </div>
          </Card>

          <Card className='bg-[var(--surface-container-lowest)] border-[var(--border-subtle)] rounded-xl shadow-sm overflow-hidden flex flex-col'>
            <div className='p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[var(--surface-container-low)]'>
              <h3 className='headline-md text-[var(--on-surface)]'>Recent Webhook Deliveries</h3>
              <div className='relative'>
                <span className='material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[var(--outline-variant)] text-sm' aria-hidden='true'>search</span>
                <Input aria-label='Search event ID' placeholder='Search event ID...' className='pl-8 h-9 bg-[var(--surface-container-lowest)] border-[var(--outline-variant)] w-64' type='search' />
              </div>
            </div>
            <Table className='min-w-[720px]'>
              <TableHeader>
                <TableRow className='bg-[var(--surface-container-lowest)] border-b border-[var(--border-subtle)] hover:bg-[var(--surface-container-lowest)]'>
                  <TableHead className='py-3 px-4 label-caps text-[var(--on-surface-variant)]'>Event ID</TableHead>
                  <TableHead className='py-3 px-4 label-caps text-[var(--on-surface-variant)]'>Endpoint</TableHead>
                  <TableHead className='py-3 px-4 label-caps text-[var(--on-surface-variant)]'>Type</TableHead>
                  <TableHead className='py-3 px-4 label-caps text-[var(--on-surface-variant)]'>Status</TableHead>
                  <TableHead className='py-3 px-4 label-caps text-[var(--on-surface-variant)]'>Time / Retry</TableHead>
                  <TableHead className='py-3 px-4 label-caps text-[var(--on-surface-variant)] text-right' aria-label='Actions' />
                </TableRow>
              </TableHeader>
              <TableBody className='divide-y divide-[var(--border-subtle)]'>
                <TableRow className='hover:bg-[var(--surface-container-highest)]/30 transition-colors group body-sm'>
                  <TableCell className='py-3 px-4 data-mono text-[var(--on-surface)]'>evt_9k2m4x1...</TableCell>
                  <TableCell className='py-3 px-4 text-[var(--on-surface-variant)]'>api.merchant.com/wh</TableCell>
                  <TableCell className='py-3 px-4'><span className='bg-[var(--surface-variant)] px-2 py-0.5 rounded text-xs'>payment.succeeded</span></TableCell>
                  <TableCell className='py-3 px-4'><span className='inline-flex items-center gap-1.5 bg-[var(--success-status)]/10 text-[var(--success-status)] px-2 py-0.5 rounded-full font-medium text-xs'><span className='w-1.5 h-1.5 rounded-full bg-[var(--success-status)]' aria-hidden='true' /> 200 OK</span></TableCell>
                  <TableCell className='py-3 px-4 text-[var(--on-surface-variant)] data-mono'>10:42:15 AM <span className='text-[var(--outline-variant)] ml-2'>(1/3)</span></TableCell>
                  <TableCell className='py-3 px-4 text-right'><Button variant='ghost' size='sm' className='h-7 text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity'>Inspect <span className='material-symbols-outlined text-sm' aria-hidden='true'>code</span></Button></TableCell>
                </TableRow>
                <TableRow className='hover:bg-[var(--surface-container-highest)]/30 transition-colors group body-sm'>
                  <TableCell className='py-3 px-4 data-mono text-[var(--on-surface)]'>evt_7j1l9p0...</TableCell>
                  <TableCell className='py-3 px-4 text-[var(--on-surface-variant)]'>hooks.erp-system.net/in</TableCell>
                  <TableCell className='py-3 px-4'><span className='bg-[var(--surface-variant)] px-2 py-0.5 rounded text-xs'>account.updated</span></TableCell>
                  <TableCell className='py-3 px-4'><span className='inline-flex items-center gap-1.5 bg-[var(--failed-status)]/10 text-[var(--failed-status)] px-2 py-0.5 rounded-full font-medium text-xs'><span className='w-1.5 h-1.5 rounded-full bg-[var(--failed-status)]' aria-hidden='true' /> 503 Unavailable</span></TableCell>
                  <TableCell className='py-3 px-4 text-[var(--on-surface-variant)] data-mono'>10:41:02 AM <span className='text-[var(--pending-status)] ml-2'>(3/5)</span></TableCell>
                  <TableCell className='py-3 px-4 text-right'><Button variant='ghost' size='sm' className='h-7 text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity'>Inspect <span className='material-symbols-outlined text-sm' aria-hidden='true'>code</span></Button></TableCell>
                </TableRow>
                <TableRow className='hover:bg-[var(--surface-container-highest)]/30 transition-colors group body-sm'>
                  <TableCell className='py-3 px-4 data-mono text-[var(--on-surface)]'>evt_4n8v2c5...</TableCell>
                  <TableCell className='py-3 px-4 text-[var(--on-surface-variant)]'>api.merchant.com/wh</TableCell>
                  <TableCell className='py-3 px-4'><span className='bg-[var(--surface-variant)] px-2 py-0.5 rounded text-xs'>payment.failed</span></TableCell>
                  <TableCell className='py-3 px-4'><span className='inline-flex items-center gap-1.5 bg-[var(--success-status)]/10 text-[var(--success-status)] px-2 py-0.5 rounded-full font-medium text-xs'><span className='w-1.5 h-1.5 rounded-full bg-[var(--success-status)]' aria-hidden='true' /> 200 OK</span></TableCell>
                  <TableCell className='py-3 px-4 text-[var(--on-surface-variant)] data-mono'>10:39:44 AM <span className='text-[var(--outline-variant)] ml-2'>(1/3)</span></TableCell>
                  <TableCell className='py-3 px-4 text-right'><Button variant='ghost' size='sm' className='h-7 text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity'>Inspect <span className='material-symbols-outlined text-sm' aria-hidden='true'>code</span></Button></TableCell>
                </TableRow>
                <TableRow className='hover:bg-[var(--surface-container-highest)]/30 transition-colors group body-sm opacity-75'>
                  <TableCell className='py-3 px-4 data-mono text-[var(--on-surface)]'>evt_2b5m8q1...</TableCell>
                  <TableCell className='py-3 px-4 text-[var(--on-surface-variant)]'>hooks.legacy-app.io/v1</TableCell>
                  <TableCell className='py-3 px-4'><span className='bg-[var(--surface-variant)] px-2 py-0.5 rounded text-xs'>transfer.created</span></TableCell>
                  <TableCell className='py-3 px-4'><span className='inline-flex items-center gap-1.5 bg-[var(--pending-status)]/10 text-[var(--pending-status)] px-2 py-0.5 rounded-full font-medium text-xs'><span className='w-1.5 h-1.5 rounded-full bg-[var(--pending-status)] animate-pulse' aria-hidden='true' /> Pending</span></TableCell>
                  <TableCell className='py-3 px-4 text-[var(--on-surface-variant)] data-mono'>10:38:10 AM <span className='text-[var(--outline-variant)] ml-2'>(in queue)</span></TableCell>
                  <TableCell className='py-3 px-4 text-right'><Button variant='ghost' size='sm' className='h-7 text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity'>Inspect <span className='material-symbols-outlined text-sm' aria-hidden='true'>code</span></Button></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className='p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-container-lowest)] text-center'>
              <a href='#' className='text-[var(--primary)] body-sm hover:underline'>View Full Webhook Log</a>
            </div>
          </Card>
        </div>

        <div className='xl:col-span-4 flex flex-col gap-gutter'>
          <Card className='bg-[var(--surface-container-lowest)] border-[var(--border-subtle)] rounded-xl p-5 shadow-sm'>
            <div className='flex items-center gap-2 mb-4 pb-3 border-b border-[var(--border-subtle)]'>
              <span className='material-symbols-outlined text-[var(--on-surface-variant)]' aria-hidden='true'>settings_alert</span>
              <h3 className='headline-md text-[var(--on-surface)]'>Monitoring Settings</h3>
            </div>
            <SystemForm />
          </Card>

          <Card className='bg-[var(--inverse-surface)] text-[var(--inverse-on-surface)] rounded-xl p-5 shadow-sm border border-[var(--outline-variant)]'>
            <h4 className='headline-md mb-2 flex items-center gap-2'>
              <span className='material-symbols-outlined text-[var(--test-mode-amber)]' aria-hidden='true'>lightbulb</span>
              Pro Tip
            </h4>
            <p className='body-sm text-[var(--outline-variant)] mb-4'>You can set up custom webhook retry schedules based on specific HTTP response codes in the Developer Portal.</p>
            <a href='#' className='text-[var(--inverse-primary)] body-sm hover:underline flex items-center gap-1'>Go to Developer Portal <span className='material-symbols-outlined text-sm' aria-hidden='true'>arrow_forward</span></a>
          </Card>
        </div>
      </div>
    </main>
  );
}
