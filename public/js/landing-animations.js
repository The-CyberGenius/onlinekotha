// Initialize GSAP ScrollTrigger for landing page
document.addEventListener("DOMContentLoaded", () => {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    
    gsap.registerPlugin(ScrollTrigger);

    const section = document.getElementById('scroll-demo-section');
    if (!section) return;

    // Create a master timeline pinned to the scroll section
    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "+=2000", // Scroll duration (px)
            scrub: 1, // Smooth scrubbing
            pin: true,
            anticipatePin: 1
        }
    });

    // Initial State Setups
    gsap.set('#step-2', { opacity: 0, y: 30 });
    gsap.set('#step-3', { opacity: 0, y: 30 });
    gsap.set('#phone-screen-2', { opacity: 0, scale: 0.95 });
    gsap.set('#phone-screen-3', { opacity: 0, y: 20 });
    gsap.set('#ai-reply', { opacity: 0, y: 15 });

    // === TRANSITION 1: Upload to Processing ===
    tl.to('#step-1', { opacity: 0, y: -30, duration: 1 }, 0)
      .to('#step-2', { opacity: 1, y: 0, duration: 1 }, 0.5)
      .to('#phone-screen-1', { opacity: 0, scale: 1.05, duration: 1 }, 0)
      .to('#phone-screen-2', { opacity: 1, scale: 1, duration: 1 }, 0.5)
      
      // Animate progress circle (SVG path)
      .to('#progress-circle circle', { 
          strokeDashoffset: 0, 
          duration: 2, 
          ease: "none" 
      }, 1)

    // === TRANSITION 2: Processing to Chat ===
      .to('#step-2', { opacity: 0, y: -30, duration: 1 }, "+=0.5")
      .to('#step-3', { opacity: 1, y: 0, duration: 1 }, "-=0.5")
      .to('#phone-screen-2', { opacity: 0, scale: 1.05, duration: 1 }, "-=1")
      .to('#phone-screen-3', { opacity: 1, y: 0, duration: 1 }, "-=0.5")
      
      // AI Reply pop in
      .to('#ai-reply', { 
          opacity: 1, 
          y: 0, 
          duration: 0.8, 
          ease: "back.out(1.5)" 
      }, "+=0.5");
});
