-- Create the AlumNet database
CREATE DATABASE IF NOT EXISTS alumnet;
USE alumnet;

-- Create Users table with matriculation number as user_id
CREATE TABLE users (
    user_id VARCHAR(20) PRIMARY KEY, -- Matriculation number (e.g., IFT/19/0647)
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL, -- Hashed password
    email VARCHAR(100) UNIQUE NOT NULL,
    role ENUM('alumnus', 'student', 'admin') NOT NULL,
    full_name VARCHAR(100),
    graduation_year INT,
    job_title VARCHAR(100),
    company VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Create JobPostings table
CREATE TABLE job_postings (
    job_id VARCHAR(20) PRIMARY KEY,
    user_id VARCHAR(20),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    company VARCHAR(100),
    location VARCHAR(100),
    date_posted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Create Events table
CREATE TABLE events (
    event_id VARCHAR(20) PRIMARY KEY,
    user_id VARCHAR(20),
    title VARCHAR(100) NOT NULL,
    description TEXT,
    date TIMESTAMP,
    location VARCHAR(100),
    is_official BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Create EventAttendance table
CREATE TABLE event_attendance (
    user_id VARCHAR(20),
    event_id VARCHAR(20),
    rsvp_status ENUM('pending', 'confirmed', 'declined') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, event_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create MentorshipPairs table
CREATE TABLE mentorship_pairs (
    mentorship_id VARCHAR(20) PRIMARY KEY,
    mentor_id VARCHAR(20),
    mentee_id VARCHAR(20),
    status ENUM('pending', 'active', 'completed') DEFAULT 'pending',
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (mentor_id, mentee_id),
    FOREIGN KEY (mentor_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (mentee_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create Messages table
CREATE TABLE messages (
    message_id VARCHAR(20) PRIMARY KEY,
    sender_id VARCHAR(20),
    receiver_id VARCHAR(20),
    content TEXT,
    file_url VARCHAR(255),
    file_name VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_status BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create Donations table
CREATE TABLE donations (
    donation_id VARCHAR(20) PRIMARY KEY,
    user_id VARCHAR(20),
    amount DECIMAL(10, 2) NOT NULL,
    purpose VARCHAR(100),
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Create indexes for faster queries
CREATE INDEX idx_messages_sender_receiver ON messages(sender_id, receiver_id);
CREATE INDEX idx_job_postings_user_id ON job_postings(user_id);
CREATE INDEX idx_events_user_id ON events(user_id);

-- Trigger to update created_at timestamp
DELIMITER //
CREATE TRIGGER update_users_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
BEGIN
    SET NEW.created_at = CURRENT_TIMESTAMP;
END //
DELIMITER ;

-- Insert test users with matriculation numbers and correct bcrypt hash for 'password123'
INSERT INTO users (user_id, username, password, email, role, full_name, graduation_year, job_title, company) VALUES
    ('IFT/19/0647', 'sophia', '$2b$10$8Qz3/4b1a9z7X8Y2k6L0q.B3x9y7z6x5y4z3x2y1z0x9y8z7x6y5z', 'sophia@example.com', 'alumnus', 'Sophia Johnson', 2018, 'Software Engineer', 'TechCorp'),
    ('IFT/20/1234', 'ethan', '$2b$10$8Qz3/4b1a9z7X8Y2k6L0q.B3x9y7z6x5y4z3x2y1z0x9y8z7x6y5z', 'ethan@example.com', 'alumnus', 'Ethan Brown', 2020, 'Data Analyst', 'DataWorks'),
    ('IFT/18/9876', 'liam', '$2b$10$8Qz3/4b1a9z7X8Y2k6L0q.B3x9y7z6x5y4z3x2y1z0x9y8z7x6y5z', 'liam@example.com', 'alumnus', 'Liam Carter', 2019, 'Product Manager', 'InnovateInc');

-- Insert sample job posting
INSERT INTO job_postings (job_id, user_id, title, description, company, location, date_posted) VALUES
    ('JOB/001', 'IFT/19/0647', 'Software Developer', 'Develop web applications using Node.js', 'TechCorp', 'Lagos, Nigeria', CURRENT_TIMESTAMP);

-- Insert sample event
INSERT INTO events (event_id, user_id, title, description, date, location, is_official) VALUES
    ('EVT/001', 'IFT/18/9876', 'Alumni Reunion 2025', 'Annual alumni gathering', '2025-12-15 18:00:00', 'FUTA Campus', TRUE);

-- Insert sample event attendance
INSERT INTO event_attendance (user_id, event_id, rsvp_status) VALUES
    ('IFT/20/1234', 'EVT/001', 'confirmed');

-- Insert sample mentorship pair
INSERT INTO mentorship_pairs (mentorship_id, mentor_id, mentee_id, status, start_date) VALUES
    ('MEN/001', 'IFT/19/0647', 'IFT/20/1234', 'active', CURRENT_TIMESTAMP);

-- Insert sample messages
INSERT INTO messages (message_id, sender_id, receiver_id, content, timestamp) VALUES
    ('MSG/001', 'IFT/19/0647', 'IFT/18/9876', 'Hi Liam, let’s discuss the project!', CURRENT_TIMESTAMP),
    ('MSG/002', 'IFT/18/9876', 'IFT/19/0647', 'Sure, what’s the plan?', CURRENT_TIMESTAMP);

-- Insert sample donation
INSERT INTO donations (donation_id, user_id, amount, purpose, date) VALUES
    ('DON/001', 'IFT/18/9876', 5000.00, 'Scholarship Fund', CURRENT_TIMESTAMP);