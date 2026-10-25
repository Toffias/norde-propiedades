import { describe, expect, it } from 'vitest';

import { assignmentRecipient, type Assignment } from './assignment-notice';

const base: Assignment = {
  type: 'opportunity.assigned',
  fromAgentId: 'agent-1',
  toAgentId: 'agent-2',
  assignedBy: 'manager-1',
  inquiryId: undefined,
};

describe('assignmentRecipient', () => {
  it('notifies the new agent when someone else assigns', () => {
    expect(assignmentRecipient(base)).toBe('agent-2');
  });

  it('notifies on events from before who assigned was recorded', () => {
    expect(assignmentRecipient({ ...base, assignedBy: undefined })).toBe('agent-2');
  });

  it('notifies nobody when it was left without an agent', () => {
    expect(assignmentRecipient({ ...base, toAgentId: undefined })).toBeUndefined();
  });

  it('notifies nobody when the agent did not change (only the branch)', () => {
    expect(assignmentRecipient({ ...base, toAgentId: 'agent-1' })).toBeUndefined();
  });

  it('does not notify whoever assigned it to themselves', () => {
    expect(assignmentRecipient({ ...base, assignedBy: 'agent-2' })).toBeUndefined();
  });

  it('announces an assigned inquiry once, as the inquiry', () => {
    const viaInquiry = { ...base, inquiryId: 'inquiry-1' };

    expect(assignmentRecipient(viaInquiry)).toBeUndefined();
    expect(assignmentRecipient({ ...viaInquiry, type: 'client.assigned' })).toBeUndefined();
    expect(
      assignmentRecipient({ ...viaInquiry, type: 'inquiry.assigned', fromAgentId: undefined }),
    ).toBe('agent-2');
  });
});
