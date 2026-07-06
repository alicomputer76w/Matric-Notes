document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Mobile Menu Toggle (Hamburger)
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Close menu when a link is clicked
        document.querySelectorAll('.nav-menu a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }

  // 2. Smooth Scrolling for Anchor Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        
        // Skip if href is empty, just '#', or not a valid selector
        if (!targetId || targetId === '#' || targetId.startsWith('http')) {
            return;
        }
        
        // Check if it's a valid CSS selector (starts with #)
        if (!targetId.startsWith('#')) {
            return;
        }
        
        e.preventDefault();
        
        try {
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        } catch (error) {
            console.warn('Invalid selector:', targetId);
        }
    });
});

    // 3. Navbar Scroll Effect (Optional: adds shadow on scroll)
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)";
        } else {
            navbar.style.boxShadow = "0 2px 10px rgba(0,0,0,0.05)";
        }
    });

    console.log("EduPortal Website Loaded Successfully!");
});