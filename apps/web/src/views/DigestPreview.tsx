/**
 * Daily Digest preview — renders a DigestPayload (timeline, driving
 * responsibilities, key tasks, flagged items) as it would appear in the
 * email / WhatsApp message a member receives.
 */
import { useState } from 'react';
import type { DigestItem, DigestPayload } from '@nestai/contracts';

import type { DashboardSnapshot } from '../api';
import { Badge, Card, EmptyState } from '../components/ui';
import { formatDayTime, memberName } from '../lib/format';

export function DigestPreview({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { digests, members } = snapshot;
  const [selected, setSelected] = useState(digests[0]?.memberId ?? '');
  const digest =
    digests.find((d) => d.memberId === selected) ?? digests[0];

  return (
    <Card
      title="Daily digest preview"
      subtitle="How the morning digest renders in email / WhatsApp."
      actions={
        <select
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          aria-label="Select member digest"
        >
          {digests.map((d) => (
            <option key={d.memberId} value={d.memberId}>
              {memberName(members, d.memberId)}
            </option>
          ))}
        </select>
      }
    >
      {!digest ? (
        <EmptyState>No digest available.</EmptyState>
      ) : (
        <DigestCard digest={digest} memberName={memberName(members, digest.memberId)} />
      )}
    </Card>
  );
}

function isFlagged(item: DigestItem): boolean {
  return (
    item.urgency === 'HIGH' ||
    item.urgency === 'CRITICAL' ||
    /sole|approval|conflict/i.test(item.note ?? '')
  );
}

function isDriving(item: DigestItem): boolean {
  return /driv|carpool|pickup|drop-?off/i.test(
    `${item.title} ${item.note ?? ''}`,
  );
}

function DigestCard({
  digest,
  memberName: name,
}: {
  digest: DigestPayload;
  memberName: string;
}) {
  const driving = digest.items.filter(isDriving);
  const flagged = digest.items.filter(isFlagged);

  return (
    <div className="mx-auto max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="bg-ink px-5 py-4 text-white">
        <p className="text-xs uppercase tracking-wide text-slate-300">
          NestAI · Daily Digest
        </p>
        <h3 className="mt-0.5 text-lg font-semibold">
          {digest.greeting ?? `Good morning, ${name}`}
        </h3>
        <p className="text-xs text-slate-300">{digest.date}</p>
      </div>

      <div className="space-y-4 px-5 py-4">
        <Section title="Today's timeline">
          {digest.items.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing scheduled.</p>
          ) : (
            <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
              {digest.items.map((item, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[18px] top-1.5 h-2 w-2 rounded-full bg-blue-500" />
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  {item.when && (
                    <p className="text-xs text-slate-500">
                      {formatDayTime(item.when)}
                    </p>
                  )}
                  {item.note && (
                    <p className="text-xs text-slate-500">{item.note}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Section>

        {driving.length > 0 && (
          <Section title="🚗 Driving responsibilities">
            <ul className="space-y-1">
              {driving.map((item, i) => (
                <li key={i} className="text-sm text-ink">
                  {item.title}
                  {item.when && (
                    <span className="text-slate-500"> · {formatDayTime(item.when)}</span>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {flagged.length > 0 && (
          <Section title="⚠️ Flagged items">
            <ul className="space-y-1">
              {flagged.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {item.urgency && <Badge tone="red">{item.urgency}</Badge>}
                  <span className="text-ink">{item.note ?? item.title}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {digest.summary && (
          <div className="rounded-lg bg-canvas px-3 py-2 text-sm text-slate-600">
            {digest.summary}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      {children}
    </div>
  );
}
