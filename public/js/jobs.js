// Jobs Page JavaScript
class JobsManager {
    constructor() {
        this.jobs = [];
        this.filteredJobs = [];
        this.selectedCategories = [];
        this.currentSort = 'date_desc';
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadJobs();
    }

    bindEvents() {
        // Search functionality
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterJobs();
            });
        }

        // Filter dropdowns
        const locationFilter = document.getElementById('locationFilter');
        const jobTypeFilter = document.getElementById('jobTypeFilter');
        const sortFilter = document.getElementById('sortFilter');

        if (locationFilter) {
            locationFilter.addEventListener('change', () => this.filterJobs());
        }
        if (jobTypeFilter) {
            jobTypeFilter.addEventListener('change', () => this.filterJobs());
        }
        if (sortFilter) {
            sortFilter.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.sortAndDisplayJobs();
            });
        }

        // Post job form
        const postJobForm = document.getElementById('postJobForm');
        if (postJobForm) {
            postJobForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitJob(e.target);
            });
        }
    }

    async loadJobs() {
        try {
            const response = await fetch('/api/jobs');
            if (response.ok) {
                this.jobs = await response.json();
                this.filteredJobs = [...this.jobs];
                this.sortAndDisplayJobs();
            }
        } catch (error) {
            console.error('Error loading jobs:', error);
        }
    }

    filterJobs() {
        const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const locationFilter = document.getElementById('locationFilter')?.value || '';
        const jobTypeFilter = document.getElementById('jobTypeFilter')?.value || '';

        this.filteredJobs = this.jobs.filter(job => {
            const matchesSearch = !searchTerm || 
                job.title.toLowerCase().includes(searchTerm) ||
                job.company.toLowerCase().includes(searchTerm) ||
                job.description.toLowerCase().includes(searchTerm);

            const matchesLocation = !locationFilter || 
                job.remote_type === locationFilter ||
                job.location.toLowerCase().includes(locationFilter.toLowerCase());

            const matchesJobType = !jobTypeFilter || job.job_type === jobTypeFilter;

            const matchesCategory = this.selectedCategories.length === 0 ||
                this.selectedCategories.some(categoryId => 
                    job.categories && job.categories.includes(categoryId)
                );

            return matchesSearch && matchesLocation && matchesJobType && matchesCategory;
        });

        this.sortAndDisplayJobs();
    }

    sortAndDisplayJobs() {
        // Sort jobs
        this.filteredJobs.sort((a, b) => {
            switch (this.currentSort) {
                case 'date_desc':
                    return new Date(b.date_posted) - new Date(a.date_posted);
                case 'date_asc':
                    return new Date(a.date_posted) - new Date(b.date_posted);
                case 'salary_desc':
                    return (b.salary_max || 0) - (a.salary_max || 0);
                case 'salary_asc':
                    return (a.salary_min || 0) - (b.salary_min || 0);
                case 'applications_desc':
                    return (b.applications_count || 0) - (a.applications_count || 0);
                default:
                    return 0;
            }
        });

        this.displayJobs();
    }

    displayJobs() {
        const jobsList = document.getElementById('jobsList');
        if (!jobsList) return;

        if (this.filteredJobs.length === 0) {
            jobsList.innerHTML = `
                <div class="text-center py-12">
                    <svg class="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2V6"></path>
                    </svg>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
                    <p class="text-gray-500 mb-4">Try adjusting your search criteria or post a new job!</p>
                    <button onclick="openPostJobModal()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                        Post a Job
                    </button>
                </div>
            `;
            return;
        }

        jobsList.innerHTML = this.filteredJobs.map(job => this.renderJobCard(job)).join('');
    }

    renderJobCard(job) {
        const salaryDisplay = job.salary_min && job.salary_max ? 
            `<div class="flex items-center space-x-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                </svg>
                <span>${job.salary_currency || 'USD'} ${job.salary_min.toLocaleString()} - ${job.salary_max.toLocaleString()}</span>
            </div>` : '';

        const featuredBadge = job.is_featured ? 
            '<span class="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded-full">Featured</span>' : '';

        return `
            <div class="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 job-card" data-job-id="${job.job_id}">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex-1">
                        <div class="flex items-center space-x-2 mb-2">
                            <h3 class="text-xl font-bold text-gray-900 hover:text-blue-600 cursor-pointer" onclick="viewJobDetails('${job.job_id}')">
                                ${job.title}
                            </h3>
                            ${featuredBadge}
                        </div>
                        <p class="text-lg text-gray-600 mb-2">${job.company}</p>
                        <div class="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                            <div class="flex items-center space-x-1">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
                                </svg>
                                <span>${job.location}</span>
                            </div>
                            <div class="flex items-center space-x-1">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span>${job.job_type || 'Full-time'}</span>
                            </div>
                            ${salaryDisplay}
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="toggleBookmark('${job.job_id}')" class="p-2 text-gray-400 hover:text-red-500 transition-colors bookmark-btn" data-job-id="${job.job_id}">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <p class="text-gray-600 mb-4 line-clamp-2">${job.description}</p>
                
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4 text-sm text-gray-500">
                        <span>${job.applications_count || 0} applications</span>
                        <span>${job.views_count || 0} views</span>
                        <span>${new Date(job.date_posted).toLocaleDateString()}</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="viewJobDetails('${job.job_id}')" class="text-blue-600 hover:text-blue-800 font-medium text-sm">
                            View Details
                        </button>
                        <button onclick="applyForJob('${job.job_id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            Apply Now
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    async submitJob(form) {
        const formData = new FormData(form);
        const jobData = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/jobs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(jobData)
            });

            if (response.ok) {
                const newJob = await response.json();
                this.jobs.unshift(newJob);
                this.filterJobs();
                closePostJobModal();
                form.reset();
                showNotification('Job posted successfully!', 'success');
            } else {
                const error = await response.json();
                showNotification(error.message || 'Failed to post job', 'error');
            }
        } catch (error) {
            console.error('Error posting job:', error);
            showNotification('Failed to post job', 'error');
        }
    }
}

// Global functions for UI interactions
function toggleCategory(categoryId) {
    const button = document.querySelector(`[data-category="${categoryId}"]`);
    const index = jobsManager.selectedCategories.indexOf(categoryId);
    
    if (index > -1) {
        jobsManager.selectedCategories.splice(index, 1);
        button.classList.remove('bg-blue-100', 'text-blue-700');
        button.classList.add('bg-gray-100', 'text-gray-700');
    } else {
        jobsManager.selectedCategories.push(categoryId);
        button.classList.remove('bg-gray-100', 'text-gray-700');
        button.classList.add('bg-blue-100', 'text-blue-700');
    }
    
    jobsManager.filterJobs();
}

function openPostJobModal() {
    document.getElementById('postJobModal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closePostJobModal() {
    document.getElementById('postJobModal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

async function viewJobDetails(jobId) {
    try {
        // Increment view count
        await fetch(`/api/jobs/${jobId}/view`, { method: 'POST' });
        
        // Redirect to job details page or open modal
        window.location.href = `/jobs/${jobId}`;
    } catch (error) {
        console.error('Error viewing job details:', error);
    }
}

async function applyForJob(jobId) {
    try {
        const response = await fetch(`/api/jobs/${jobId}/apply`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            showNotification('Application submitted successfully!', 'success');
            // Update the job card to show applied status
            const jobCard = document.querySelector(`[data-job-id="${jobId}"]`);
            if (jobCard) {
                const applyButton = jobCard.querySelector('button[onclick*="applyForJob"]');
                if (applyButton) {
                    applyButton.textContent = 'Applied';
                    applyButton.disabled = true;
                    applyButton.classList.remove('bg-blue-600', 'hover:bg-blue-700');
                    applyButton.classList.add('bg-gray-400', 'cursor-not-allowed');
                }
            }
        } else {
            const error = await response.json();
            showNotification(error.message || 'Failed to apply for job', 'error');
        }
    } catch (error) {
        console.error('Error applying for job:', error);
        showNotification('Failed to apply for job', 'error');
    }
}

async function toggleBookmark(jobId) {
    try {
        const response = await fetch(`/api/jobs/${jobId}/bookmark`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            const result = await response.json();
            const bookmarkBtn = document.querySelector(`[data-job-id="${jobId}"].bookmark-btn`);
            
            if (result.bookmarked) {
                bookmarkBtn.classList.remove('text-gray-400');
                bookmarkBtn.classList.add('text-red-500');
                showNotification('Job bookmarked!', 'success');
            } else {
                bookmarkBtn.classList.remove('text-red-500');
                bookmarkBtn.classList.add('text-gray-400');
                showNotification('Bookmark removed', 'info');
            }
        }
    } catch (error) {
        console.error('Error toggling bookmark:', error);
        showNotification('Failed to update bookmark', 'error');
    }
}

function viewMyApplications() {
    window.location.href = '/my-applications';
}

function viewBookmarkedJobs() {
    window.location.href = '/bookmarked-jobs';
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full`;
    
    const colors = {
        success: 'bg-green-500 text-white',
        error: 'bg-red-500 text-white',
        info: 'bg-blue-500 text-white',
        warning: 'bg-yellow-500 text-black'
    };
    
    notification.className += ` ${colors[type] || colors.info}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Initialize jobs manager when DOM is loaded
let jobsManager;
document.addEventListener('DOMContentLoaded', () => {
    jobsManager = new JobsManager();
});

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('postJobModal');
    if (e.target === modal) {
        closePostJobModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closePostJobModal();
    }
});
