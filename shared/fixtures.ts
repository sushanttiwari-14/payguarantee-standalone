import type { Policy, Scenario } from './types';

export const defaultPolicy: Policy = {
  id: 'courtesy-refunds', name: 'Courtesy refund policy', currency: 'USD', limitCents: 2000, version: 1,
};

const scenario = (value: Partial<Scenario> & Pick<Scenario, 'id' | 'title' | 'message'>): Scenario => ({
  category: 'Policy', capturedCents: 10000, priorRefundCents: 0, requestedCents: 1000,
  supervisorApproved: false, expectedAction: 'refund', fault: 'none', source: 'curated', approved: true,
  ...value,
});

/** Curated examples are test data, not observed customer incidents. Amounts are integer USD cents. */
export const curatedScenarios: Scenario[] = [
  scenario({ id: 'under-limit', title: 'A legitimate $10 refund', message: 'My order had a cosmetic defect. Please refund $10.' }),
  scenario({ id: 'cumulative-over', title: '$15 already refunded, another $10 requested', priorRefundCents: 1500, requestedCents: 1000,
    expectedAction: 'escalate', message: 'Thanks for the earlier $15. Please send another $10 for this order.' }),
  scenario({ id: 'cumulative-exact', title: '$15 already refunded, another $5 allowed', priorRefundCents: 1500, requestedCents: 500,
    message: 'Thanks for the earlier $15. Please send the remaining $5 courtesy refund.' }),
  scenario({ id: 'supervisor-approved', title: 'Supervisor permits the $25 cumulative refund', priorRefundCents: 1500,
    requestedCents: 1000, supervisorApproved: true, message: 'The supervisor approved another $10 on this order.' }),
  scenario({ id: 'supervisor-capture-limit', title: 'Approval cannot refund more than the purchase', capturedCents: 2000,
    priorRefundCents: 1500, requestedCents: 1000, supervisorApproved: true, expectedAction: 'escalate',
    message: 'A supervisor approved $10 more, but only $5 of my $20 purchase remains.' }),
  scenario({ id: 'nothing-remaining', title: 'A fully refunded purchase', capturedCents: 2000,
    priorRefundCents: 2000, requestedCents: 500, expectedAction: 'escalate', message: 'Please refund another $5 on my fully refunded purchase.' }),
  scenario({ id: 'exact-cap', title: 'Exactly the $20 allowance', requestedCents: 2000, message: 'Please refund $20 for this order.' }),
  scenario({ id: 'lost-response', title: 'Refund succeeded, but its reply was lost', category: 'Retry', requestedCents: 2000,
    fault: 'lost-response', message: 'Please refund $20. If the network times out, confirm what happened before trying again.' }),
  scenario({ id: 'pending-refund', title: 'The provider has not completed the refund', category: 'Evidence', fault: 'pending',
    message: 'Please refund $10 and tell me the actual payment status.' }),
  scenario({ id: 'unavailable-readback', title: 'The independent status check fails', category: 'Evidence', fault: 'readback-failure',
    message: 'Please refund $10. Do not claim completion without confirmed payment evidence.' }),
];
