/**
 * Lead Management Module
 * Saves customer purchase leads for follow-up
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const LEADS_PATH = path.join(__dirname, '..', 'data', 'leads.json');

/**
 * Read leads from file
 */
function readLeads() {
  try {
    if (!fs.existsSync(LEADS_PATH)) {
      return [];
    }
    const data = fs.readFileSync(LEADS_PATH, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Error reading leads:', error);
    return [];
  }
}

/**
 * Write leads to file
 */
function writeLeads(leads) {
  try {
    const dir = path.dirname(LEADS_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing leads:', error);
  }
}

/**
 * Save a new lead
 * @param {string} fullName - Customer's full name
 * @param {string} phoneNumber - Customer's phone number
 * @param {Array} selectedProducts - List of products customer wants to buy
 * @param {Object} additionalInfo - Additional information (session, conversation, etc.)
 * @returns {Object} - Saved lead object
 */
async function saveLead(fullName, phoneNumber, selectedProducts = [], additionalInfo = {}) {
  const leads = readLeads();
  
  const lead = {
    id: uuidv4(),
    fullName: fullName.trim(),
    phoneNumber: phoneNumber.trim(),
    selectedProducts: selectedProducts,
    status: 'new', // new, contacted, confirmed, delivered, cancelled
    paymentMethod: 'cash_on_delivery',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sessionId: additionalInfo.sessionId || null,
    notes: additionalInfo.notes || '',
    source: 'chat_system'
  };
  
  leads.push(lead);
  writeLeads(leads);
  
  console.log(`✅ New lead saved: ${fullName} - ${phoneNumber} - Products: ${selectedProducts.join(', ')}`);
  
  return lead;
}

/**
 * Update lead status
 * @param {string} leadId - Lead ID
 * @param {string} status - New status
 * @param {string} notes - Optional notes
 */
function updateLeadStatus(leadId, status, notes = '') {
  const leads = readLeads();
  const leadIndex = leads.findIndex(l => l.id === leadId);
  
  if (leadIndex === -1) {
    throw new Error('Lead not found');
  }
  
  leads[leadIndex].status = status;
  leads[leadIndex].updatedAt = new Date().toISOString();
  
  if (notes) {
    leads[leadIndex].notes = (leads[leadIndex].notes || '') + '\n' + notes;
  }
  
  writeLeads(leads);
  return leads[leadIndex];
}

/**
 * Get all leads
 * @param {Object} filters - Optional filters (status, date range, etc.)
 */
function getLeads(filters = {}) {
  const leads = readLeads();
  
  if (Object.keys(filters).length === 0) {
    return leads;
  }
  
  return leads.filter(lead => {
    if (filters.status && lead.status !== filters.status) {
      return false;
    }
    
    if (filters.startDate && new Date(lead.createdAt) < new Date(filters.startDate)) {
      return false;
    }
    
    if (filters.endDate && new Date(lead.createdAt) > new Date(filters.endDate)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Get lead statistics
 */
function getLeadStats() {
  const leads = readLeads();
  
  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    confirmed: leads.filter(l => l.status === 'confirmed').length,
    delivered: leads.filter(l => l.status === 'delivered').length,
    cancelled: leads.filter(l => l.status === 'cancelled').length,
    todayLeads: leads.filter(l => {
      const today = new Date().toDateString();
      return new Date(l.createdAt).toDateString() === today;
    }).length
  };
  
  return stats;
}

module.exports = {
  saveLead,
  updateLeadStatus,
  getLeads,
  getLeadStats,
  readLeads,
  writeLeads
};
