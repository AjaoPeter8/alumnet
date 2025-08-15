// Missing Mentorship API Endpoints
// Add these to your main index.js file

// Withdraw mentorship request (for mentees)
app.post('/api/mentorship/withdraw-request', authenticateToken, async (req, res) => {
  const { request_id } = req.body;
  const userId = req.user.user_id;

  try {
    // Verify the request belongs to this user and is pending
    const [request] = await pool.query(`
      SELECT * FROM mentorship_requests 
      WHERE request_id = ? AND mentee_id = ? AND status = 'pending'
    `, [request_id, userId]);

    if (request.length === 0) {
      return res.status(404).json({ success: false, message: 'Request not found or cannot be withdrawn' });
    }

    // Update request status to withdrawn
    await pool.query('UPDATE mentorship_requests SET status = "withdrawn", updated_at = CURRENT_TIMESTAMP WHERE request_id = ?', [request_id]);

    // Log activity
    await pool.query(
      'INSERT INTO user_activities (user_id, activity_type, description) VALUES (?, ?, ?)',
      [userId, 'mentorship', `Withdrew mentorship request ID: ${request_id}`]
    );

    res.json({ success: true, message: 'Mentorship request withdrawn successfully!' });
  } catch (err) {
    console.error('Withdraw request error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Get real-time mentorship statistics
app.get('/api/mentorship/stats', authenticateToken, async (req, res) => {
  try {
    // Get comprehensive mentorship statistics
    const [stats] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM mentors WHERE is_active = TRUE) as total_mentors,
        (SELECT COUNT(*) FROM mentors WHERE is_active = TRUE AND availability_status = 'available') as active_mentors,
        (SELECT COUNT(*) FROM mentorship_requests) as total_requests,
        (SELECT COUNT(*) FROM mentorship_requests WHERE status = 'pending') as pending_requests,
        (SELECT COUNT(*) FROM mentorship_requests WHERE status = 'accepted') as accepted_requests,
        (SELECT COUNT(*) FROM active_mentorships WHERE status = 'active') as active_mentorships,
        (SELECT COUNT(*) FROM active_mentorships WHERE status = 'completed') as completed_mentorships
    `);
    
    res.json({ 
      success: true, 
      stats: stats[0] || {
        total_mentors: 0,
        active_mentors: 0,
        total_requests: 0,
        pending_requests: 0,
        accepted_requests: 0,
        active_mentorships: 0,
        completed_mentorships: 0
      }
    });
  } catch (err) {
    console.error('Get mentorship stats error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});

// Refresh mentorship data (for real-time updates)
app.get('/api/mentorship/refresh-data', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;

  try {
    // Get updated mentorship data
    const [sentRequests] = await pool.query(`
      SELECT 
        mr.*,
        u.username as mentor_username,
        u.full_name as mentor_name,
        m.bio as mentor_bio
      FROM mentorship_requests mr
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      JOIN users u ON m.user_id = u.user_id
      WHERE mr.mentee_id = ?
      ORDER BY mr.created_at DESC
    `, [userId]);

    const [receivedRequests] = await pool.query(`
      SELECT 
        mr.*,
        u.username as mentee_username,
        u.full_name as mentee_name,
        u.profile_picture_url as mentee_avatar
      FROM mentorship_requests mr
      JOIN users u ON mr.mentee_id = u.user_id
      JOIN mentors m ON mr.mentor_id = m.mentor_id
      WHERE m.user_id = ?
      ORDER BY mr.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      data: {
        sentRequests,
        receivedRequests
      }
    });
  } catch (err) {
    console.error('Refresh mentorship data error:', err);
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
  }
});
