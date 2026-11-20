import { describe, expect, it } from 'vitest';
import { buildShield, describeEntries, detectPii } from './shield';

const letter = `Dear Mr. Ramesh Kumar,

Re: Account No. 4021 7788 1290

The minimum amount due of ₹2,450 fell due on 15 October 2026. Please pay by 30 November 2026 before 6:00 PM.
Call our helpline on 1800 555 0199 or write to care@bank.example, quoting your customer ID CUST88213456.
Mr. Kumar, you can also pay with UPI to ramesh@okbank.`;

describe('privacy shield', () => {
  it('finds names, account and ID numbers, phone numbers and emails', () => {
    const values = detectPii(letter).map((s) => `${s.kind}:${s.value}`);
    expect(values).toEqual(
      expect.arrayContaining([
        'name:Ramesh Kumar',
        'account:4021 7788 1290',
        'phone:1800 555 0199',
        'email:care@bank.example',
        'id:CUST88213456',
        'name:Kumar',
        'id:ramesh@okbank',
      ]),
    );
  });

  it('leaves amounts, dates and times alone', () => {
    const masked = buildShield(letter).mask(letter);
    for (const fact of ['₹2,450', '15 October 2026', '30 November 2026', '6:00 PM']) expect(masked).toContain(fact);
    for (const secret of ['Ramesh', 'Kumar', '4021 7788 1290', '1800 555 0199', 'care@bank.example', 'CUST88213456']) {
      expect(masked).not.toContain(secret);
    }
    expect(masked).toContain('Dear Mr. [NAME_1],');
  });

  it('restores the original values, even if the model changes spacing or case', () => {
    const shield = buildShield(letter);
    const reply = 'Hello [NAME_1]. Call [phone_1] or email [ EMAIL_1 ]. Quote [ID 1]. Keep [ACCOUNT_1] safe.';
    expect(shield.restore(reply)).toBe(
      'Hello Ramesh Kumar. Call 1800 555 0199 or email care@bank.example. Quote CUST88213456. Keep 4021 7788 1290 safe.',
    );
  });

  it('hides a placeholder that is only half streamed', () => {
    const shield = buildShield(letter);
    expect(shield.restoreStreaming('Call [PHO')).toBe('Call ');
    expect(shield.restoreStreaming('Call [PHONE_1')).toBe('Call ');
    expect(shield.restoreStreaming('See [Note')).toBe('See [Note');
  });

  it('only replaces whole words', () => {
    const shield = buildShield('Name: Ram\nRamesh walked to the ramp.');
    expect(shield.mask('Ram met Ramesh near the ramp.')).toBe('[NAME_1] met Ramesh near the ramp.');
  });

  it('ignores greetings that are not names and labels without a number', () => {
    expect(detectPii('Dear Customer, your account is ready. In order to pay, use your card.')).toEqual([]);
    expect(detectPii('Dear Valued Customer, the policy of the bank is simple.')).toEqual([]);
  });

  it('detects card numbers only when they pass the Luhn check, and labelled addresses', () => {
    expect(detectPii('Card 4111 1111 1111 1111 expires soon.').map((s) => s.kind)).toEqual(['card']);
    const spans = detectPii('Address: 12 Lake Road, Chennai\nPIN: 600001');
    expect(spans.map((s) => s.kind)).toEqual(['address', 'address']);
  });

  it('describes what it hid in plain words', () => {
    expect(describeEntries(buildShield(letter).entries)).toBe(
      '2 names, an account number, a phone number, an email address and 2 ID numbers',
    );
  });
});
