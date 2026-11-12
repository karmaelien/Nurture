/** @typedef {'owner' | 'admin' | 'member'} Role */
/** @typedef {'parent' | 'grandparent' | 'spouse' | 'sibling' | 'child' | 'friend' | 'other'} Relationship */

/** @typedef {{ id: string, name: string, email: string, phone: string | null, timeZone: string | null }} User */
/** @typedef {{ id: string, name: string, relationship: Relationship | null }} Recipient */

module.exports = {};