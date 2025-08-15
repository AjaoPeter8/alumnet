// Mentorship System JavaScript Functions

// Notification System
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotification = document.getElementById('mentorship-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'mentorship-notification';
    notification.className = `fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full`;
    
    // Set notification style based on type
    const styles = {
        'success': 'bg-green-500 text-white',
        'error': 'bg-red-500 text-white',
        'warning': 'bg-yellow-500 text-white',
        'info': 'bg-blue-500 text-white'
    };
    
    notification.className += ` ${styles[type] || styles.info}`;
    notification.innerHTML = `
        <div class="flex items-center space-x-2">
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white hover:text-gray-200">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }
    }, 5000);
}

// Modal Management
function openBecomeMentorModal() {
    document.getElementById('becomeMentorModal').classList.remove('hidden');
    document.getElementById('becomeMentorModal').classList.add('flex');
    
    // Re-initialize checkboxes when modal opens
    setTimeout(() => {
        const expertiseCheckboxes = document.querySelectorAll('input[name="expertise_areas"]');
        expertiseCheckboxes.forEach(checkbox => {
            checkbox.removeEventListener('click', checkboxClickHandler);
            checkbox.removeEventListener('change', checkboxChangeHandler);
            checkbox.addEventListener('click', checkboxClickHandler);
            checkbox.addEventListener('change', checkboxChangeHandler);
        });
    }, 100);
}

function checkboxClickHandler(e) {
    console.log('Checkbox clicked:', this.value, 'Checked:', this.checked);
}

function checkboxChangeHandler(e) {
    console.log('Checkbox changed:', this.value, 'Checked:', this.checked);
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

function openPendingRequestsModal() {
    loadPendingRequests();
    document.getElementById('pendingRequestsModal').classList.remove('hidden');
    document.getElementById('pendingRequestsModal').classList.add('flex');
}

function closePendingRequestsModal() {
    document.getElementById('pendingRequestsModal').classList.add('hidden');
    document.getElementById('pendingRequestsModal').classList.remove('flex');
}

function openMyRequestsModal() {
    loadMyRequests();
    document.getElementById('myRequestsModal').classList.remove('hidden');
    document.getElementById('myRequestsModal').classList.add('flex');
}

function closeMyRequestsModal() {
    document.getElementById('myRequestsModal').classList.add('hidden');
    document.getElementById('myRequestsModal').classList.remove('flex');
}

function openMentorDashboard() {
    // Redirect to mentor dashboard
    window.location.href = '/mentorship/dashboard';
}

// removed debug helpers

// Become a Mentor Form Submission
document.addEventListener('DOMContentLoaded', function() {
    const becomeMentorForm = document.getElementById('becomeMentorForm');
    if (becomeMentorForm) {
        // prepare expertise checkbox listeners
        const expertiseCheckboxes = document.querySelectorAll('input[name="expertise_areas"]');
        expertiseCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('click', checkboxClickHandler);
            checkbox.addEventListener('change', checkboxChangeHandler);
        });
        
        becomeMentorForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const expertiseAreas = [];
            
            // Collect selected expertise areas
            const expertiseCheckboxes = document.querySelectorAll('input[name="expertise_areas"]:checked');
            console.log('Found expertise checkboxes:', expertiseCheckboxes.length);
            console.log('All expertise checkboxes:', document.querySelectorAll('input[name="expertise_areas"]').length);
            
            expertiseCheckboxes.forEach(checkbox => {
                expertiseAreas.push(checkbox.value);
                console.log('Selected expertise:', checkbox.value);
            });
            
            // Validation
            const bio = formData.get('bio');
            const yearsOfExperience = formData.get('years_of_experience');
            
            if (!bio || bio.trim().length < 50) {
                showNotification('Please provide a bio with at least 50 characters', 'error');
                return;
            }
            
            if (!yearsOfExperience || yearsOfExperience < 0) {
                showNotification('Please enter your years of experience', 'error');
                return;
            }
            
            if (expertiseAreas.length === 0) {
                showNotification('Please select at least one expertise area', 'error');
                return;
            }
            
            const mentorData = {
                bio: formData.get('bio'),
                years_of_experience: parseInt(formData.get('years_of_experience')) || 0,
                expertise_areas: JSON.stringify(expertiseAreas),
                max_mentees: parseInt(formData.get('max_mentees')) || 3,
                preferred_communication: formData.get('preferred_communication') || 'chat',
                mentoring_style: formData.get('mentoring_style') || ''
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

// Accept mentorship request (for mentors)
async function acceptMentorshipRequest(requestId) {
    try {
        const response = await fetch('/api/mentorship/respond-request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                request_id: requestId,
                action: 'accept'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Mentorship request accepted successfully!', 'success');
            
            // Remove the request from the UI immediately
            const requestElement = document.querySelector(`[data-request-id="${requestId}"]`);
            if (requestElement) {
                requestElement.style.opacity = '0.5';
                requestElement.style.pointerEvents = 'none';
                setTimeout(() => {
                    requestElement.remove();
                }, 500);
            }
            
            // Refresh pending requests and stats
            await refreshPendingRequests();
            await refreshMentorshipStats();
            
            // Check if no more requests and update UI
            setTimeout(() => {
                const remainingRequests = document.querySelectorAll('#pendingRequestsList > div:not(.text-center)');
                if (remainingRequests.length === 0) {
                    document.getElementById('pendingRequestsList').innerHTML = '<div class="text-center py-8 text-gray-500">No pending requests</div>';
                }
            }, 600);
        } else {
            showNotification(result.message || 'Failed to accept request', 'error');
        }
    } catch (error) {
        console.error('Error accepting request:', error);
        showNotification('An error occurred. Please try again.', 'error');
    }
}

// Decline mentorship request (for mentors)
async function declineMentorshipRequest(requestId) {
    if (!confirm('Are you sure you want to decline this mentorship request?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/mentorship/respond-request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                request_id: requestId,
                action: 'decline'
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Mentorship request declined successfully!', 'success');
            
            // Remove the request from the UI immediately
            const requestElement = document.querySelector(`[data-request-id="${requestId}"]`);
            if (requestElement) {
                requestElement.style.opacity = '0.5';
                requestElement.style.pointerEvents = 'none';
                setTimeout(() => {
                    requestElement.remove();
                }, 500);
            }
            
            // Refresh pending requests and stats
            await refreshPendingRequests();
            await refreshMentorshipStats();
            
            // Check if no more requests and update UI
            setTimeout(() => {
                const remainingRequests = document.querySelectorAll('#pendingRequestsList > div:not(.text-center)');
                if (remainingRequests.length === 0) {
                    document.getElementById('pendingRequestsList').innerHTML = '<div class="text-center py-8 text-gray-500">No pending requests</div>';
                }
            }, 600);
        } else {
            showNotification(result.message || 'Failed to decline request', 'error');
        }
    } catch (error) {
        console.error('Error declining request:', error);
        showNotification('An error occurred. Please try again.', 'error');
    }
}

// Withdraw mentorship request (for mentees)
async function withdrawMentorshipRequest(requestId) {
    if (!confirm('Are you sure you want to withdraw this mentorship request?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/mentorship/withdraw-request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                request_id: requestId
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Mentorship request withdrawn successfully!', 'success');
            
            // Remove the request from the UI immediately
            const requestElement = document.querySelector(`[data-request-id="${requestId}"]`);
            if (requestElement) {
                requestElement.style.opacity = '0.5';
                requestElement.style.pointerEvents = 'none';
                setTimeout(() => {
                    requestElement.remove();
                }, 500);
            }
            
            // Refresh my requests and stats
            await refreshMyRequests();
            await refreshMentorshipStats();
            
            // Check if no more requests and update UI
            setTimeout(() => {
                const remainingRequests = document.querySelectorAll('#myRequestsList > div:not(.text-center)');
                if (remainingRequests.length === 0) {
                    document.getElementById('myRequestsList').innerHTML = '<div class="text-center py-8 text-gray-500">No requests sent</div>';
                }
            }, 600);
        } else {
            showNotification(result.message || 'Failed to withdraw request', 'error');
        }
    } catch (error) {
        console.error('Error withdrawing request:', error);
        showNotification('An error occurred. Please try again.', 'error');
    }
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
                    
                    // Refresh stats to update pending requests count
                    await refreshMentorshipStats();
                    
                    // If my requests modal is open, refresh it
                    const myRequestsModal = document.getElementById('myRequestsModal');
                    if (myRequestsModal && !myRequestsModal.classList.contains('hidden')) {
                        await refreshMyRequests();
                    }
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

// Enhanced Filter and Search System
let allMentors = [];
let currentPage = 1;
const mentorsPerPage = 9;

// Initialize mentors data
function initializeMentors() {
    const mentorCards = document.querySelectorAll('.mentor-card');
    allMentors = Array.from(mentorCards).map(card => ({
        element: card,
        expertise: card.getAttribute('data-expertise'),
        experience: parseInt(card.getAttribute('data-experience')) || 0,
        mentorId: card.getAttribute('data-mentor-id')
    }));
    
    updatePagination();
    showPage(1);
}

// Filter Mentors with enhanced functionality
function filterMentors() {
    const expertiseFilter = document.getElementById('expertiseFilter').value;
    const experienceFilter = document.getElementById('experienceFilter').value;
    
    const filteredMentors = allMentors.filter(mentor => {
        let showMentor = true;
        
        // Filter by expertise
        if (expertiseFilter) {
            try {
                const expertiseList = JSON.parse(mentor.expertise || '[]');
                if (!expertiseList.some(exp => exp.toLowerCase().includes(expertiseFilter.toLowerCase()))) {
                    showMentor = false;
                }
            } catch (e) {
                if (!mentor.expertise.toLowerCase().includes(expertiseFilter.toLowerCase())) {
                    showMentor = false;
                }
            }
        }
        
        // Filter by experience
        if (experienceFilter && showMentor) {
            const [min, max] = experienceFilter.includes('+') 
                ? [15, Infinity] 
                : experienceFilter.split('-').map(Number);
            
            if (mentor.experience < min || mentor.experience > max) {
                showMentor = false;
            }
        }
        
        return showMentor;
    });
    
    // Hide all mentors first
    allMentors.forEach(mentor => mentor.element.style.display = 'none');
    
    // Show filtered mentors
    filteredMentors.forEach(mentor => mentor.element.style.display = 'block');
    
    // Update pagination for filtered results
    updatePaginationForFiltered(filteredMentors);
    
    // Show appropriate state
    if (filteredMentors.length === 0) {
        showNoMentorsState();
    } else {
        hideNoMentorsState();
        showPage(1);
    }
}

// Clear all filters
function clearFilters() {
    document.getElementById('expertiseFilter').value = '';
    document.getElementById('experienceFilter').value = '';
    
    // Show all mentors
    allMentors.forEach(mentor => mentor.element.style.display = 'block');
    
    // Reset pagination
    updatePagination();
    showPage(1);
    hideNoMentorsState();
}

// Show specific page of mentors
function showPage(page) {
    const startIndex = (page - 1) * mentorsPerPage;
    const endIndex = startIndex + mentorsPerPage;
    
    allMentors.forEach((mentor, index) => {
        if (index >= startIndex && index < endIndex) {
            mentor.element.style.display = 'block';
        } else {
            mentor.element.style.display = 'none';
        }
    });
    
    currentPage = page;
    updatePaginationButtons();
}

// Update pagination for filtered results
function updatePaginationForFiltered(filteredMentors) {
    const totalPages = Math.ceil(filteredMentors.length / mentorsPerPage);
    updatePaginationInfo(1, totalPages, filteredMentors.length);
}

// Update pagination info
function updatePagination() {
    const totalPages = Math.ceil(allMentors.length / mentorsPerPage);
    updatePaginationInfo(currentPage, totalPages, allMentors.length);
}

function updatePaginationInfo(current, total, count) {
    const pageInfo = document.getElementById('pageInfo');
    pageInfo.textContent = `Page ${current} of ${total} (${count} mentors)`;
    
    // Update button states
    document.getElementById('prevPage').disabled = current <= 1;
    document.getElementById('nextPage').disabled = current >= total;
}

// Update pagination button states
function updatePaginationButtons() {
    const totalPages = Math.ceil(allMentors.length / mentorsPerPage);
    document.getElementById('prevPage').disabled = currentPage <= 1;
    document.getElementById('nextPage').disabled = currentPage >= totalPages;
}

// Show no mentors state
function showNoMentorsState() {
    document.getElementById('noMentorsState').classList.remove('hidden');
    document.getElementById('mentorsGrid').classList.add('hidden');
    document.getElementById('pagination').classList.add('hidden');
}

// Hide no mentors state
function hideNoMentorsState() {
    document.getElementById('noMentorsState').classList.add('hidden');
    document.getElementById('mentorsGrid').classList.remove('hidden');
    document.getElementById('pagination').classList.remove('hidden');
}

// Previous page
function previousPage() {
    if (currentPage > 1) {
        showPage(currentPage - 1);
        updatePagination();
    }
}

// Next page
function nextPage() {
    const totalPages = Math.ceil(allMentors.length / mentorsPerPage);
    if (currentPage < totalPages) {
        showPage(currentPage + 1);
        updatePagination();
    }
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

// Load pending requests for mentors
async function loadPendingRequests() {
    try {
        const response = await fetch('/api/mentorship/my-mentorships');
        const result = await response.json();
        
        if (result.success) {
            displayPendingRequests(result.data.receivedRequests || []);
            document.getElementById('pendingRequestsModal').classList.remove('hidden');
            document.getElementById('pendingRequestsModal').classList.add('flex');
        } else {
            showNotification('Failed to load pending requests', 'error');
        }
    } catch (error) {
        console.error('Error loading pending requests:', error);
        showNotification('An error occurred while loading pending requests', 'error');
    }
}

// Load user's own requests
async function loadMyRequests() {
    try {
        const response = await fetch('/api/mentorship/my-mentorships');
        const result = await response.json();
        
        if (result.success) {
            displayMyRequests(result.data.sentRequests || []);
        } else {
            showNotification('Failed to load my requests', 'error');
        }
    } catch (error) {
        console.error('Error loading my requests:', error);
        showNotification('An error occurred while loading my requests', 'error');
    }
}

// Display user's mentorships in a modal or redirect to dashboard
function displayMyMentorships(mentorships) {
    // For now, redirect to a dedicated page
    window.location.href = '/mentorship/my-mentorships';
}

// Display pending requests for mentors
function displayPendingRequests(requests) {
    const container = document.getElementById('pendingRequestsList');
    
    if (requests.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500">No pending requests</div>';
        return;
    }
    
    container.innerHTML = requests.map(request => `
        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200" data-request-id="${request.request_id}">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="font-semibold text-gray-900">${request.mentee_name || 'Unknown User'}</h3>
                    <p class="text-sm text-gray-600">${request.mentee_username || ''}</p>
                </div>
                <span class="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                    Pending
                </span>
            </div>
            
            <div class="mb-3">
                <p class="text-gray-700 mb-2"><strong>Message:</strong> ${request.request_message || 'No message'}</p>
                <p class="text-gray-700 mb-2"><strong>Goals:</strong> ${request.goals || 'No goals specified'}</p>
                <p class="text-gray-700 mb-2"><strong>Duration:</strong> ${request.preferred_duration || 'Not specified'}</p>
                <p class="text-sm text-gray-500">Requested: ${new Date(request.created_at).toLocaleDateString()}</p>
            </div>
            
            <div class="flex gap-2">
                <button onclick="acceptMentorshipRequest(${request.request_id})" 
                        class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                    Accept
                </button>
                <button onclick="declineMentorshipRequest(${request.request_id})" 
                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                    Decline
                </button>
            </div>
        </div>
    `).join('');
}

// Display user's own requests
function displayMyRequests(requests) {
    const container = document.getElementById('myRequestsList');
    
    if (requests.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500">No requests sent</div>';
        return;
    }
    
    container.innerHTML = requests.map(request => {
        const statusColors = {
            'pending': 'bg-yellow-100 text-yellow-800',
            'accepted': 'bg-green-100 text-green-800',
            'declined': 'bg-red-100 text-red-800',
            'withdrawn': 'bg-gray-100 text-gray-800'
        };
        
        const statusColor = statusColors[request.status] || 'bg-gray-100 text-gray-800';
        
        return `
            <div class="bg-gray-50 rounded-lg p-4 border border-gray-200" data-request-id="${request.request_id}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h3 class="font-semibold text-gray-900">${request.mentor_name || 'Unknown Mentor'}</h3>
                        <p class="text-sm text-gray-600">${request.mentor_username || ''}</p>
                    </div>
                    <span class="px-2 py-1 text-xs font-medium ${statusColor} rounded-full capitalize">
                        ${request.status}
                    </span>
                </div>
                
                <div class="mb-3">
                    <p class="text-gray-700 mb-2"><strong>Message:</strong> ${request.request_message || 'No message'}</p>
                    <p class="text-gray-700 mb-2"><strong>Goals:</strong> ${request.goals || 'No goals specified'}</p>
                    <p class="text-gray-700 mb-2"><strong>Duration:</strong> ${request.preferred_duration || 'Not specified'}</p>
                    <p class="text-sm text-gray-500">Sent: ${new Date(request.created_at).toLocaleDateString()}</p>
                </div>
                
                ${request.status === 'pending' ? `
                    <div class="flex gap-2">
                        <button onclick="withdrawMentorshipRequest(${request.request_id})" 
                                class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
                            Withdraw Request
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Refresh mentorship statistics
async function refreshMentorshipStats() {
    try {
        const response = await fetch('/api/mentorship/stats');
        const result = await response.json();
        
        if (result.success) {
            // Update stats display
            const stats = result.stats;
            
            // Update the stats section if elements exist
            const totalMentorsEl = document.querySelector('[data-stat="total_mentors"]');
            const activeMentorsEl = document.querySelector('[data-stat="active_mentors"]');
            const totalRequestsEl = document.querySelector('[data-stat="total_requests"]');
            const pendingRequestsEl = document.querySelector('[data-stat="pending_requests"]');
            const acceptedRequestsEl = document.querySelector('[data-stat="accepted_requests"]');
            const activeMentorshipsEl = document.querySelector('[data-stat="active_mentorships"]');
            const completedMentorshipsEl = document.querySelector('[data-stat="completed_mentorships"]');
            
            if (totalMentorsEl) totalMentorsEl.textContent = stats.total_mentors || 0;
            if (activeMentorsEl) activeMentorsEl.textContent = stats.active_mentors || 0;
            if (totalRequestsEl) totalRequestsEl.textContent = stats.total_requests || 0;
            if (pendingRequestsEl) pendingRequestsEl.textContent = stats.pending_requests || 0;
            if (acceptedRequestsEl) acceptedRequestsEl.textContent = stats.accepted_requests || 0;
            if (activeMentorshipsEl) activeMentorshipsEl.textContent = stats.active_mentorships || 0;
            if (completedMentorshipsEl) completedMentorshipsEl.textContent = stats.completed_mentorships || 0;
            
            // Animate stats update
            animateStatsUpdate();
        }
    } catch (error) {
        console.error('Error refreshing stats:', error);
    }
}

// Animate stats update for better UX
function animateStatsUpdate() {
    const statElements = document.querySelectorAll('[data-stat]');
    statElements.forEach(element => {
        element.classList.add('animate-pulse');
        setTimeout(() => {
            element.classList.remove('animate-pulse');
        }, 1000);
    });
}

// Add mentor card animations and interactions
function addMentorCardInteractions() {
    const mentorCards = document.querySelectorAll('.mentor-card');
    
    mentorCards.forEach(card => {
        // Add hover effects
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-8px) scale(1.02)';
            this.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0) scale(1)';
            this.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
        });
        
        // Add click to expand bio functionality
        const bioElement = card.querySelector('p');
        if (bioElement && bioElement.textContent.length > 100) {
            bioElement.style.cursor = 'pointer';
            bioElement.title = 'Click to expand';
            
            bioElement.addEventListener('click', function() {
                if (this.classList.contains('line-clamp-3')) {
                    this.classList.remove('line-clamp-3');
                    this.title = 'Click to collapse';
                } else {
                    this.classList.add('line-clamp-3');
                    this.title = 'Click to expand';
                }
            });
        }
    });
}

// Refresh pending requests without closing modal
async function refreshPendingRequests() {
    try {
        const response = await fetch('/api/mentorship/my-mentorships');
        const result = await response.json();
        
        if (result.success) {
            displayPendingRequests(result.data.receivedRequests || []);
        }
    } catch (error) {
        console.error('Error refreshing pending requests:', error);
    }
}

// Refresh my requests without closing modal
async function refreshMyRequests() {
    try {
        const response = await fetch('/api/mentorship/my-mentorships');
        const result = await response.json();
        
        if (result.success) {
            displayMyRequests(result.data.sentRequests || []);
        }
    } catch (error) {
        console.error('Error refreshing my requests:', error);
    }
}

// Load my requests and show modal
async function loadMyRequests() {
    try {
        const response = await fetch('/api/mentorship/my-mentorships');
        const result = await response.json();
        
        if (result.success) {
            displayMyRequests(result.data.sentRequests || []);
            document.getElementById('myRequestsModal').classList.remove('hidden');
            document.getElementById('myRequestsModal').classList.add('flex');
        } else {
            showNotification('Failed to load my requests', 'error');
        }
    } catch (error) {
        console.error('Error loading my requests:', error);
        showNotification('An error occurred while loading my requests', 'error');
    }
}

// Auto-refresh stats every 30 seconds
function startAutoRefresh() {
    setInterval(refreshMentorshipStats, 30000);
}

// Show loading state
function showLoadingState() {
    document.getElementById('mentorsLoading').classList.remove('hidden');
    document.getElementById('mentorsGrid').classList.add('hidden');
}

// Hide loading state
function hideLoadingState() {
    document.getElementById('mentorsLoading').classList.add('hidden');
    document.getElementById('mentorsGrid').classList.remove('hidden');
}

// Add keyboard navigation for accessibility
function addKeyboardNavigation() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K to focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('mentorSearch');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Escape to clear filters
        if (e.key === 'Escape') {
            const searchInput = document.getElementById('mentorSearch');
            if (searchInput && searchInput.value) {
                searchInput.value = '';
                searchMentors();
            }
        }
        
        // Arrow keys for pagination
        if (e.key === 'ArrowLeft' && !e.target.matches('input, textarea, select')) {
            e.preventDefault();
            previousPage();
        }
        
        if (e.key === 'ArrowRight' && !e.target.matches('input, textarea, select')) {
            e.preventDefault();
            nextPage();
        }
    });
}

// Add tooltips for better UX
function addTooltips() {
    const mentorCards = document.querySelectorAll('.mentor-card');
    
    mentorCards.forEach(card => {
        const availabilityBadge = card.querySelector('.status-badge');
        if (availabilityBadge) {
            const status = availabilityBadge.textContent.trim();
            let tooltip = '';
            
            switch(status.toLowerCase()) {
                case 'available':
                    tooltip = 'This mentor is currently accepting new mentees';
                    break;
                case 'busy':
                    tooltip = 'This mentor is currently busy but may accept requests';
                    break;
                case 'unavailable':
                    tooltip = 'This mentor is not currently accepting new mentees';
                    break;
                default:
                    tooltip = 'Mentor availability status';
            }
            
            availabilityBadge.title = tooltip;
        }
    });
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

// Add event listeners for filters and pagination
document.addEventListener('DOMContentLoaded', function() {
    const expertiseFilter = document.getElementById('expertiseFilter');
    const experienceFilter = document.getElementById('experienceFilter');
    const clearFiltersBtn = document.getElementById('clearFilters');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    
    // Initialize mentors system
    if (document.querySelectorAll('.mentor-card').length > 0) {
        initializeMentors();
    }
    
    // Filter event listeners
    if (expertiseFilter) {
        expertiseFilter.addEventListener('change', filterMentors);
    }
    
    if (experienceFilter) {
        experienceFilter.addEventListener('change', filterMentors);
    }
    
    // Clear filters
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearFilters);
    }
    
    // Pagination event listeners
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', previousPage);
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', nextPage);
    }
    
    // Add search functionality
    addSearchFunctionality();
    
    // Add smooth scrolling for better UX
    addSmoothScrolling();
    
    // Add mentor card interactions
    addMentorCardInteractions();
    
    // Start auto-refresh for stats
    startAutoRefresh();
    
    // Add keyboard navigation for accessibility
    addKeyboardNavigation();
    
    // Add tooltips for better UX
    addTooltips();
});

// Add search functionality
function addSearchFunctionality() {
    // Add search input to the page if it doesn't exist
    const filterSection = document.querySelector('.flex.flex-col.gap-4.md\\:flex-row.md\\:justify-between.md\\:items-center.mb-8');
    if (filterSection && !document.getElementById('mentorSearch')) {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'w-full md:w-auto';
        searchContainer.innerHTML = `
            <div class="relative">
                <input type="text" 
                       id="mentorSearch" 
                       placeholder="Search mentors..." 
                       class="w-full md:w-64 px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <svg class="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
            </div>
        `;
        
        // Insert search before the filters
        const filtersDiv = filterSection.querySelector('.grid');
        filterSection.insertBefore(searchContainer, filtersDiv);
        
        // Add search event listener
        const searchInput = document.getElementById('mentorSearch');
        searchInput.addEventListener('input', debounce(searchMentors, 300));
    }
}

// Search mentors by name, bio, or expertise
function searchMentors() {
    const searchTerm = document.getElementById('mentorSearch').value.toLowerCase();
    
    if (!searchTerm.trim()) {
        // If no search term, show all mentors
        allMentors.forEach(mentor => mentor.element.style.display = 'block');
        updatePagination();
        showPage(1);
        hideNoMentorsState();
        return;
    }
    
    const searchResults = allMentors.filter(mentor => {
        const mentorName = mentor.element.querySelector('h3').textContent.toLowerCase();
        const mentorBio = mentor.element.querySelector('p').textContent.toLowerCase();
        const mentorExpertise = mentor.expertise.toLowerCase();
        
        return mentorName.includes(searchTerm) || 
               mentorBio.includes(searchTerm) || 
               mentorExpertise.includes(searchTerm);
    });
    
    // Hide all mentors first
    allMentors.forEach(mentor => mentor.element.style.display = 'none');
    
    // Show search results
    searchResults.forEach(mentor => mentor.element.style.display = 'block');
    
    // Update pagination for search results
    updatePaginationForFiltered(searchResults);
    
    // Show appropriate state
    if (searchResults.length === 0) {
        showNoMentorsState();
    } else {
        hideNoMentorsState();
        showPage(1);
    }
}

// Add smooth scrolling for better UX
function addSmoothScrolling() {
    // Smooth scroll to top when filters change
    const filters = document.querySelectorAll('#expertiseFilter, #experienceFilter');
    filters.forEach(filter => {
        filter.addEventListener('change', () => {
            setTimeout(() => {
                document.getElementById('mentorsGrid').scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }, 100);
        });
    });
}

// Debounce function for search
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

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
