// Tab functionality
document.addEventListener("DOMContentLoaded", () => {
  // Initialize Matrix rain effect
  initMatrixRain();

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.getAttribute("data-tab");

      // Remove active class from all buttons and contents
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      tabContents.forEach((content) => content.classList.remove("active"));

      // Add active class to clicked button and corresponding content
      button.classList.add("active");
      document.getElementById(tabId).classList.add("active");
    });
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // Add scroll-based animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
      }
    });
  }, observerOptions);

  // Observe feature cards and doc cards
  document.querySelectorAll(".feature-card, .doc-card").forEach((card) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(20px)";
    card.style.transition = "opacity 0.5s ease, transform 0.5s ease";
    observer.observe(card);
  });

  // Navbar background on scroll
  const nav = document.querySelector(".nav");
  let lastScrollY = window.scrollY;

  window.addEventListener("scroll", () => {
    if (window.scrollY > 100) {
      nav.style.background = "rgba(10, 10, 15, 0.9)";
      nav.style.backdropFilter = "blur(10px)";
      nav.style.borderBottom = "1px solid rgba(39, 39, 42, 0.5)";
    } else {
      nav.style.background = "transparent";
      nav.style.backdropFilter = "none";
      nav.style.borderBottom = "none";
    }
    lastScrollY = window.scrollY;
  });
});

// Copy install command
function copyInstall() {
  const text = "bun add fast-injection";
  copyToClipboard(text);
  showCopyFeedback(event.currentTarget);
}

// Copy code block
function copyCode(elementId) {
  const codeElement = document.getElementById(elementId);
  const text = codeElement.textContent;
  copyToClipboard(text);
  showCopyFeedback(event.currentTarget);
}

// Generic copy to clipboard
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
    textArea.remove();
  }
}

// Show copy feedback
function showCopyFeedback(button) {
  const originalHTML = button.innerHTML;
  button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    `;
  button.style.color = "#34d399";

  setTimeout(() => {
    button.innerHTML = originalHTML;
    button.style.color = "";
  }, 2000);
}

// Add parallax effect to hero glow
document.addEventListener("mousemove", (e) => {
  const glow = document.querySelector(".hero-glow");
  if (glow) {
    const x = (e.clientX / window.innerWidth - 0.5) * 30;
    const y = (e.clientY / window.innerHeight - 0.5) * 30;
    glow.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }
});

// Add floating animation to hero logo on scroll
window.addEventListener("scroll", () => {
  const heroLogo = document.querySelector(".hero-logo-img");
  if (heroLogo) {
    const scrolled = window.scrollY;
    heroLogo.style.transform = `translateY(${scrolled * 0.1}px) rotate(${scrolled * 0.02}deg)`;
  }
});

// Easter egg: Konami code for fun animation
let konamiCode = [];
const konamiSequence = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

document.addEventListener("keydown", (e) => {
  konamiCode.push(e.key);
  konamiCode = konamiCode.slice(-10);

  if (konamiCode.join(",") === konamiSequence.join(",")) {
    document.body.style.animation = "rainbow 2s linear";
    setTimeout(() => {
      document.body.style.animation = "";
    }, 2000);
  }
});

// Add rainbow animation keyframes dynamically
const style = document.createElement("style");
style.textContent = `
    @keyframes rainbow {
        0% { filter: hue-rotate(0deg); }
        100% { filter: hue-rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Floating Code Snippets Effect
function initMatrixRain() {
  const canvas = document.getElementById("matrix-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // Real example code lines from fast-injection usage
  const codeLines = [
    'import { Container } from "fast-injection";',
    'import { singleton, inject } from "fast-injection/decorators";',
    "@singleton()",
    "class Database {",
    "  connect() { /* ... */ }",
    "}",
    "@singleton()",
    "class UserService {",
    "  constructor(@inject(Database) private db: Database) {}",
    "  getUser(id: string) {",
    "    return this.db.query(`SELECT * FROM users`);",
    "  }",
    "}",
    "const container = new Container();",
    "container.register(Database);",
    "container.register(UserService);",
    "const userService = container.resolve(UserService);",
    "@transient()",
    "@scoped()",
    "const scope = container.createScope();",
    "await container.dispose();",
    "Lifetime.Singleton",
    "Lifetime.Transient",
    'onInit() { console.log("initialized"); }',
    "onDispose() { this.cleanup(); }",
    "factory: (c) => new Service(c.resolve(Dep))",
  ];

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  resize();
  window.addEventListener("resize", resize);

  // Floating code snippet objects
  const snippets = [];
  const maxSnippets = 15;

  function createSnippet() {
    const text = codeLines[Math.floor(Math.random() * codeLines.length)];
    return {
      text,
      x: Math.random() * canvas.width,
      y: canvas.height + 20,
      speed: 0.3 + Math.random() * 0.5,
      opacity: 0.1 + Math.random() * 0.25,
      fontSize: 11 + Math.floor(Math.random() * 4),
    };
  }

  // Initialize snippets
  for (let i = 0; i < maxSnippets; i++) {
    const snippet = createSnippet();
    snippet.y = Math.random() * canvas.height;
    snippets.push(snippet);
  }

  function draw() {
    // Clear with page background color
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw each floating snippet
    snippets.forEach((snippet, index) => {
      ctx.font = `${snippet.fontSize}px 'JetBrains Mono', monospace`;

      // Gradient color from purple to green based on position
      const hue = 140 + (snippet.x / canvas.width) * 60; // 140 (green) to 200 (purple-ish)
      ctx.fillStyle = `hsla(${hue}, 70%, 50%, ${snippet.opacity})`;

      ctx.fillText(snippet.text, snippet.x, snippet.y);

      // Move upward
      snippet.y -= snippet.speed;

      // Reset when off screen
      if (snippet.y < -20) {
        snippets[index] = createSnippet();
      }
    });
  }

  // Run animation at 30fps
  setInterval(draw, 33);
}
