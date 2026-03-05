// WhatsApp target normalization and validation

/** Validate and normalize a phone number to E.164 format */
export function normalizePhoneNumber(raw: string): string {
  // Strip whitespace, dashes, parens
  let cleaned = raw.replace(/[\s\-\(\)]/g, "");

  // If it's a group JID, return as-is
  if (cleaned.endsWith("@g.us")) {
    return cleaned;
  }

  // Add @s.whatsapp.net suffix if missing
  if (!cleaned.includes("@")) {
    // Ensure leading + for international numbers
    if (!cleaned.startsWith("+")) {
      cleaned = `+${cleaned}`;
    }
    // Validate E.164: + followed by 10-15 digits
    const digits = cleaned.slice(1);
    if (!/^\d{10,15}$/.test(digits)) {
      throw new Error(`Invalid phone number format: ${raw}`);
    }
    return `${cleaned}@s.whatsapp.net`;
  }

  return cleaned;
}

/** Check if a target is a group JID */
export function isGroupJid(target: string): boolean {
  return target.endsWith("@g.us");
}

/** Extract the phone number from a WhatsApp JID */
export function extractPhoneFromJid(jid: string): string {
  return jid.split("@")[0] || jid;
}
