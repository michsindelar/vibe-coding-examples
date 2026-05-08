# General Website Specification

## 1. Project Overview
This document outlines the technical and functional requirements for the development of a professional corporate website. The website serves as a primary digital presence, providing information about the organization’s mission, services, and past work.

### Core Requirements
* **Architecture:** Static website (HTML5, CSS3, JavaScript).
* **Backend:** None (No server-side database or processing).
* **Navigation:** At least two distinct pages (e.g., Home and one or more subpages).
* **Responsiveness:** Optimized for viewing on desktop, tablet, and mobile devices.

---

## 2. Design and Visual Identity
The visual design should be consistent with the organization’s branding and professional standards.

* **Color Palette:**
    * **Primary Color:** Used for headers and main UI elements.
    * **Secondary Color:** Used for call-to-action buttons and accents.
    * **Background Colors:** Neutral tones for readability.
    * **Palette Presence:** The selected brand colors should be visible across heroes, section backgrounds, cards, calls to action, footer styling, and placeholder assets while preserving text contrast.
* **Typography:**
    * **Headings:** Clear, bold font family.
    * **Body Text:** Highly legible font with standard line-height for accessibility.
* **Imagery:** Professional placeholders for team photos, project galleries, and icons. Placeholder imagery should use a visual motif that fits the business category, such as software nodes, care/wellness pulse lines, financial charts, hospitality table settings, built-environment blueprint forms, creative gallery blocks, retail shelves, or professional service briefcase forms.

---

## 3. Site Structure
The website will follow a hierarchical structure with a persistent navigation header and a common footer.
Each page hero must remain first. The AI UX designer chooses the order of the content sections below the hero based on the organization's business model, audience, and message priority.

### 3.1 Home Page
The landing page provides a high-level overview of the organization.
* **Hero Section:** A prominent heading, sub-heading, and a call-to-action button.
* **Introduction:** A brief section describing the organization’s purpose and value proposition.
* **Partnership Section:** A dedicated area for logos of affiliated partners or clients.
* **Capabilities Section:** Include this when the organization should not have a Project Portfolio page. Use it to explain practical services, product strengths, or operating capabilities without inventing past project work.
* **Reviews / Testimonials:** A section displaying feedback from clients or users to build trust.

### 3.2 About Us (Subpage)
A page dedicated to the history and internal culture of the organization.
* **Mission & Vision:** Statements regarding the organization's long-term goals.
* **Team Section:** Profiles of key personnel with placeholder titles and descriptions.
* **Company History:** A timeline or narrative describing the growth of the entity.

### 3.3 Project Portfolio (Conditional Subpage)
Add this page only when the organization has past work or portfolio-style output.
* **Project Portfolio:** Show a grid or list of projects with titles, descriptions, and categories. Do not invent project work for companies without a portfolio.

### 3.4 Contact (Subpage)
A page focused on communication.
* **Contact Information:** Physical address, general contact email, and telephone number.
* **Contact Form:** A static HTML form including fields for Name, Email, Subject, and Message. (Submission to be handled via a third-party service or a mailto link).

---

## 4. Technical Specifications
* **Language Standards:** Semantic HTML5 to ensure accessibility and SEO.
* **Styling:** Modular CSS (or a utility-first framework) for consistent layout and spacing. CSS styles must follow the BEM methodology.
* **Functionality:**
    * Mobile-responsive navigation menu (hamburger menu).
    * Smooth scrolling for internal links.
    * Interactive elements (e.g., hovering effects on buttons).

---

## 5. Performance and SEO
* **SEO Metadata:** Each page must include unique meta titles and descriptions.
* **Asset Optimization:** Images must be compressed for fast loading speeds.
* **Cross-Browser Compatibility:** The site must function correctly across all modern browsers (Chrome, Firefox, Safari, Edge).

---

## 6. Delivery & Hosting
* **Deliverables:** A directory containing all `.html`, `.css`, and `.js` files, along with an `assets` folder for images.
* **Hosting:** The static files are intended for deployment on static hosting platforms (e.g., GitHub Pages, Netlify, or similar).
