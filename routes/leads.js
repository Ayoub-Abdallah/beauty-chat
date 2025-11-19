const express = require('express');
const router = express.Router();
const { getLeads, getLeadStats, updateLeadStatus } = require('../utils/saveLead');

/**
 * Get all leads with optional filtering
 * GET /api/leads?status=new&startDate=2025-11-01
 */
router.get('/', (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    // Remove undefined filters
    Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);
    
    const leads = getLeads(filters);
    
    res.json({
      success: true,
      count: leads.length,
      leads: leads
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get lead statistics
 * GET /api/leads/stats
 */
router.get('/stats', (req, res) => {
  try {
    const stats = getLeadStats();
    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update lead status
 * PUT /api/leads/:id/status
 * Body: { status: 'contacted', notes: 'Called customer' }
 */
router.put('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }
    
    const validStatuses = ['new', 'contacted', 'confirmed', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const updatedLead = updateLeadStatus(id, status, notes || '');
    
    res.json({
      success: true,
      lead: updatedLead
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
