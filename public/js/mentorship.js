// Mentorship System JavaScript Functions

// Modal Management
function openBecomeMentorModal() {
    document.getElementById('becomeMentorModal').classList.remove('hidden');
    document.getElementById('becomeMentorModal').classList.add('flex');
}

function closeBecomeMentorModal() {
    document.getElementById('becomeMentorModal').classList.add('hidden');
    document.getElementById('becomeMentorModal').classList.remove('flex');
}

function openFindMentorModal() {
    document.getElementById('findMentorModal').classList.remove('hidden');
    document.getElementById('findMentorModal').classList.add('flex');
}

function closeFindMentorModal() {
    document.getElementById('findMentorModal').classList.add('hidden');
    document.getElementById('findMentorModal').classList.remove('flex');
}

function openRequestMentorshipModal() {
    document.getElementById('requestMentorshipModal').classList.remove('hidden');
    document.getElementById('requestMentorshipModal').classList.add('flex');
}

function closeRequestMentorshipModal() {
    document.getElementById('requestMentorshipModal').classList.add('hidden');
    document.getElementById('requestMentorshipModal').classList.remove('flex');
}

function openMyMentorshipsModal() {
    // Load user's mentorships and show modal
    loadMyMentorships();
}

function openMentorDashboard() {
    // Redirect to mentor dashboard
    window.location.href = '/mentorship/dashboard';
}

// Become a Mentor Form Submission
document.addEventListener('DOMContentLoaded', function() {
    const becomeMentorForm = document.getElementById('becomeMentorForm');
    if (becomeMentorForm) {
        becomeMentorForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const expertiseAreas = [];
            
            // Collect selected expertise areas
            const expertiseCheckboxes = document.querySelectorAll('input[name="expertise_areas"]:checked');
            expertiseCheckboxes.forEach(checkbox => {
                expertiseAreas.push(checkbox.value);
            });
            
            const mentorData = {
                bio: formData.get('bio'),
                years_of_experience: parseInt(formData.get('years_of_experience')),
                expertise_areas: JSON.stringify(expertiseAreas),
                max_mentees: parseInt(formData.get('max_mentees')),
                preferred_communication: formData.get('preferred_communication'),
                mentoring_style: formData.get('mentoring_style')
            };
            
            try {
                const response = await fetch('/api/mentorship/become-mentor', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(mentorData)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showNotification('Successfully registered as a mentor!', 'success');
                    closeBecomeMentorModal();
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } else {
                    showNotification(result.message || 'Failed to register as mentor', 'error');
                }
            } catch (error) {
                console.error('Error registering as mentor:', error);
                showNotification('An error occurred. Please try again.', 'error');
            }
        });
    }
    
    // Find Mentor Form Submission
    const findMentorForm = document.getElementById('findMentorForm');
    if (findMentorForm) {
        findMentorForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const preferredSkills = [];
            
            // Collect selected skills
            const skillCheckboxes = document.querySelectorAll('input[name="preferred_skills"]:checked');
            skillCheckboxes.forEach(checkbox => {
                preferredSkills.push(checkbox.value);
            });
            
            const preferences = {
                preferred_skills: JSON.stringify(preferredSkills),
                career_stage: formData.get('career_stage'),
                preferred_mentor_experience: formData.get('preferred_mentor_experience'),
                preferred_communication: formData.get('preferred_communication'),
                preferred_meeting_frequency: formData.get('preferred_meeting_frequency'),
                specific_goals: formData.get('specific_goals')
            };
            
            try {
                const response = await fetch('/api/mentorship/save-preferences', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(preferences)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showNotification('Preferences saved! Finding matching mentors...', 'success');
                    closeFindMentorModal();
                    
                    // Filter mentors based on preferences
                    filterMentorsByPreferences(preferences);
                } else {
                    showNotification(result.message || 'Failed to save preferences', 'error');
                }
            } catch (error) {
                console.error('Error saving preferences:', error);
                showNotification('An error occurred. Please try again.', 'error');
            }
        });
    }
});

// Request Mentorship
function requestMentorship(mentorId) {
    document.getElementById('selectedMentorId').value = mentorId;
    openRequestMentorshipModal();
}

// Submit Mentorship Request
document.addEventListener('DOMContentLoaded', function() {
    const requestForm = document.getElementById('requestMentorshipForm');
    if (requestForm) {
        requestForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const requestData = {
                mentor_id: formData.get('mentor_id'),
                request_message: formData.get('request_message'),
                goals: formData.get('goals'),
                preferred_duration: formData.get('preferred_duration')
            };
            
            try {
                const response = await fetch('/api/mentorship/request', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestData)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showNotification('Mentorship request sent successfully!', 'success');
                    closeRequestMentorshipModal();
                    this.reset();
                } else {
                    showNotification(result.message || 'Failed to send request', 'error');
                }
            } catch (error) {
                console.error('Error sending mentorship request:', error);
                showNotification('An error occurred. Please try again.', 'error');
            }
        });
    }
});

// View Mentor Profile
function viewMentorProfile(mentorId) {
    window.location.href = `/mentorship/mentor/${mentorId}`;
}

// Filter Mentors
function filterMentors() {
    const expertiseFilter = document.getElementById('expertiseFilter').value;
    const experienceFilter = document.getElementById('experienceFilter').value;
    const mentorCards = document.querySelectorAll('.mentor-card');
    
    mentorCards.forEach(card => {
        let showCard = true;
        
        // Filter by expertise
        if (expertiseFilter) {
            const cardExpertise = card.getAttribute('data-expertise');
            if (!cardExpertise.includes(expertiseFilter)) {
                showCard = false;
            }
        }
        
        // Filter by experience
        if (experienceFilter && showCard) {
            const cardExperience = parseInt(card.getAttribute('data-experience'));
            const [min, max] = experienceFilter.includes('+') 
                ? [15, Infinity] 
                : experienceFilter.split('-').map(Number);
            
            if (cardExperience < min || cardExperience > max) {
                showCard = false;
            }
        }
        
        card.style.display = showCard ? 'block' : 'none';
    });
}

// Filter mentors based on user preferences
function filterMentorsByPreferences(preferences) {
    const mentorCards = document.querySelectorAll('.mentor-card');
    const preferredSkills = JSON.parse(preferences.preferred_skills || '[]');
    
    mentorCards.forEach(card => {
        let matchScore = 0;
        const cardExpertise = card.getAttribute('data-expertise');
        
        // Check skill matches
        preferredSkills.forEach(skill => {
            if (cardExpertise.includes(skill)) {
                matchScore += 1;
            }
        });
        
        // Highlight matching mentors
        if (matchScore > 0) {
            card.classList.add('ring-2', 'ring-blue-500', 'ring-opacity-50');
            const matchBadge = document.createElement('div');
            matchBadge.className = 'absolute top-2 right-2 bg-blue-500 text-white px-2 py-1 rounded-full text-xs font-medium';
            matchBadge.textContent = `${matchScore} match${matchScore > 1 ? 'es' : ''}`;
            card.style.position = 'relative';
            card.appendChild(matchBadge);
        }
    });
    
    // Scroll to mentors section
    document.getElementById('mentorsGrid').scrollIntoView({ behavior: 'smooth' });
}

// Load user's mentorships
async function loadMyMentorships() {
    try {
        const response = await fetch('/api/mentorship/my-mentorships');
        const result = await response.json();
        
        if (result.success) {
            displayMyMentorships(result.data);
        } else {
            showNotification('Failed to load mentorships', 'error');
        }
    } catch (error) {
        console.error('Error loading mentorships:', error);
        showNotification('An error occurred while loading mentorships', 'error');
    }
}

// Display user's mentorships in a modal or redirect to dashboard
function displayMyMentorships(mentorships) {
    // For now, redirect to a dedicated page
    window.location.href = '/mentorship/my-mentorships';
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 translate-x-full`;
    
    const colors = {
        success: 'bg-green-500 text-white',
        error: 'bg-red-500 text-white',
        warning: 'bg-yellow-500 text-black',
        info: 'bg-blue-500 text-white'
    };
    
    notification.className += ` ${colors[type] || colors.info}`;
    notification.innerHTML = `
        <div class="flex items-center justify-between">
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-lg font-bold opacity-70 hover:opacity-100">×</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Add event listeners for filters
document.addEventListener('DOMContentLoaded', function() {
    const expertiseFilter = document.getElementById('expertiseFilter');
    const experienceFilter = document.getElementById('experienceFilter');
    
    if (expertiseFilter) {
        expertiseFilter.addEventListener('change', filterMentors);
    }
    
    if (experienceFilter) {
        experienceFilter.addEventListener('change', filterMentors);
    }
});

// Smart matching algorithm (client-side helper)
function calculateMentorMatch(mentor, userPreferences) {
    let score = 0;
    const maxScore = 100;
    
    try {
        const mentorExpertise = JSON.parse(mentor.expertise_areas || '[]');
        const userSkills = JSON.parse(userPreferences.preferred_skills || '[]');
        
        // Skill matching (40% of score)
        const skillMatches = mentorExpertise.filter(skill => userSkills.includes(skill));
        score += (skillMatches.length / Math.max(userSkills.length, 1)) * 40;
        
        // Experience level matching (30% of score)
        const userExpPref = userPreferences.preferred_mentor_experience;
        const mentorExp = mentor.years_of_experience;
        
        let expScore = 0;
        if (userExpPref === 'any') expScore = 30;
        else if (userExpPref === 'junior' && mentorExp >= 1 && mentorExp <= 3) expScore = 30;
        else if (userExpPref === 'mid_level' && mentorExp >= 4 && mentorExp <= 7) expScore = 30;
        else if (userExpPref === 'senior' && mentorExp >= 8 && mentorExp <= 15) expScore = 30;
        else if (userExpPref === 'executive' && mentorExp >= 15) expScore = 30;
        else expScore = 10; // Partial match
        
        score += expScore;
        
        // Communication preference matching (20% of score)
        if (mentor.preferred_communication === userPreferences.preferred_communication) {
            score += 20;
        } else {
            score += 10; // Partial match for flexibility
        }
        
        // Availability (10% of score)
        if (mentor.availability_status === 'available' && mentor.current_mentees < mentor.max_mentees) {
            score += 10;
        }
        
    } catch (error) {
        console.error('Error calculating mentor match:', error);
        return 0;
    }
    
    return Math.min(score, maxScore);
}
