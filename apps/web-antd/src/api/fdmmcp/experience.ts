import { requestClient } from '#/api/request';

export type ExperienceView = 'mine' | 'review' | 'shared';
export type Scope = 'company' | 'department';
export type CitationKind = 'chat' | 'private-trial' | 'shared-trial';
export type FeedbackOutcome = 'needs-detail' | 'outdated' | 'resolved';

export interface ExperienceInput {
  exception: string;
  method: string;
  scenario: string;
  source: string;
  title: string;
}
export interface Experience extends ExperienceInput {
  id: string;
  ownerId: string;
  ownerName: string;
  publishedVersion: null | number;
  reviewNote: string;
  scope: 'private' | Scope;
  status: 'pending' | 'personal' | 'published' | 'returned';
  version: number;
}
export interface ExperienceProfile {
  tenantId?: string;
  canReview: boolean;
  department: string;
  id: string;
  name: string;
}
export type ExperienceOwner = Pick<ExperienceProfile, 'id' | 'name'>;
export interface ExperienceUse extends Pick<
  Experience,
  'id' | 'title' | 'version'
> {
  at: string;
  kind: CitationKind;
}
export interface MyExperienceUse extends ExperienceUse {
  messageId: string;
  outcome?: FeedbackOutcome | null;
  note?: null | string;
}
export interface ExperienceFeedback extends Pick<
  Experience,
  'id' | 'title' | 'version'
> {
  readerName: string;
  outcome: FeedbackOutcome;
  note: string;
  at: string;
}
export interface ExperienceSeed {
  title: string;
  sourceKey: string;
  fields: Partial<ExperienceInput>;
}
type Revision = Pick<Experience, 'id' | 'version'>;
interface Actions {
  cite: [Revision & { kind: CitationKind; messageId: string }, { ok: true }];
  feedback: [
    Revision & { messageId: string; note?: string; outcome: FeedbackOutcome },
    { ok: true },
  ];
  feedbackList: [Record<string, never>, { items: ExperienceFeedback[] }];
  myUses: [Record<string, never>, { items: MyExperienceUse[] }];
  own: [{ id: string }, Experience];
  sourceLookup: [{ sourceKey: string }, { id: null | string }];
  list: [{ query?: string; view: ExperienceView }, { items: Experience[] }];
  owners: [
    { publishedOnly: true; query: string },
    { items: ExperienceOwner[] },
  ];
  profile: [Record<string, never>, ExperienceProfile];
  read: [Revision & { publishedOnly?: boolean }, Experience];
  review: [Revision & { approve: boolean; note: string }, Experience];
  save: [ExperienceInput & (Revision | { sourceKey: string }), Experience];
  search: [
    { ownerId?: string; personal?: boolean; query: string },
    { items: Experience[] },
  ];
  share: [Revision & { scope: Scope }, Experience];
  usage: [Record<string, never>, { items: ExperienceUse[] }];
  withdraw: [Revision, Experience];
}
export const experienceApi = <A extends keyof Actions>(
  action: A,
  data: Actions[A][0],
  signal?: AbortSignal,
) =>
  requestClient.post<Actions[A][1]>(`/fdmmcp/experience/${action}`, data, {
    signal,
    silent: true,
  });
