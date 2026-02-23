# QNIT: All Your Study Needs🎓📚

**QNIT** Is A Modern, Student‑Centric Web Platform Designed As A **Centralized Online Repository For Academic Study Resources**. It Enables Students To Easily Access Study Materials and Other Essential Academic Documents — All Managed Through A Dynamic **Admin‑Controlled System**.

🔗 **Live Public Access:** [Click Here!](https://qnit.vercel.app)

---

### ✍🏻 From The Author’s Note — Made With Passion ❤️

*This Project Was Born From The Observation of Struggles: In My Opinion, Study Resources Should Never Feel Fragile, Scattered or Time-Bound. Over Time, I Saw How Easily Important Materials Could Become Inaccessible Due To Everyday Limitations of Devices, Storage or File Availability.*

*QNIT Is My Attempt To Turn That Reality Into A Smarter, More Reliable System — One That Keeps Learning Resources Organized, Persistent and Always Within Reach, So Students Can Focus On Understanding Concepts Instead of Searching For Files. It’s Built With The Belief That Learning Should Be Effortless, Structured, and Accessible For Everyone!*

---
### ✨ Key Highlights

* Student Engagement Focused Feature Designing
* Fully Admin‑Controlled Content Management
* Secure Authentication & Authorization
* Role‑Based Dashboards (Student/Admin)
* PDF Preview, Download & Share Functionality
* Dynamic Content Updates & Feedback System

---

### 🎒 The Student Experience
* **Personalized Dashboard:** Welcoming UI With "What's New" Updates, Daily Motivational Quotes and A Built-In Memory Game For Quick Study Breaks.
* **Live Tech News:** Stay Updated With A Daily Refreshing Feed of Software Industry News.
* **Advanced Resource Viewer:** Built-In PDF Previews, Downloadable Files and Shareable Clipboard Links For Study Material Documents, Categorized Into `Latest` and `Archive` Sections.
* **Profile & Customization:** Editable User Profiles, Dynamic UI Themes and Complete Account Control Including Password Changing & Account Deletion Requests.
* **Feedback System:** A Dedicated Space For Students To Review, Rate and Edit Their Platform Experience.

### ⚙️ The Admin Command Center
* **Granular Resource Management:** An Effortless Controller For Uploading and Managing Documents (PDFs). Features Study Material Categorization, Group Heading, Latest Tag, Custom Display Names, Index Reordering and Direct Assignment To Latest/Archive Sections.
* **Live Document Control:** A Powerful "View Live Documents" Interface Utilizing Card-Based Designs To Add, Edit, Delete or Toggle The Visibility (Latest/Archive) of Active Resources In Real-Time.
* **User Analytics:** Monitor The Student Body With Active/Inactive Status Tracking (30-Day Threshold) and Latest Login Timestamps.
* **Feedback Moderation:** Direct Access To Evaluate Student Reviews and Ratings To Improve The Platform & The User Experience.

---

### 🛠️ Technical Stack

**Frontend:**
* **React.js (Vite):** Fast, Modern UI Rendering
* **Tailwind CSS:** Responsive, Utility-First Styling
* **Context API:** Global State Management (Auth/Theme/Profile)

**Backend:**
* **Node.js & Express.js:** Robust, Scalable RESTful API Architecture
* **Rate Limiting & Middlewares:** Secure Route Protection (Admin-Only Access, Auth Verification)

**Database & Authentication:**
* **Supabase (PostgreSQL):** Relational Database Management and Seamless User Authentication

**Deployment:**
* **Vercel:** Lightning-Fast Hosting For Both Frontend and Backend Environments

---

### 🗂️ Full Project Structure

```text
QNIT/
├── Backend/
│   ├── src/
│   │   ├── config/             # Supabase Configuration
│   │   ├── controllers/      # Request Handling Logic
│   │   ├── middlewares/   # Auth, Rate-Limit, Admin Guards
│   │   ├── models/           # User Models
│   │   ├── routes/            # API Routes
│   │   └── services/         # Service Logic & Helpers
│   └── server.js               # Backend Entry Point
│
├── Frontend/
│   ├── public/                 # Static Assets & Data
│   ├── src/
│   │   ├── pages/            # Student, Admin & Auth Pages
│   │   ├── components/   # Dashboard-Specific Components
│   │   ├── common/        # Reusable UI Components
│   │   ├── context/          # Global State & Theme/Auth Context
│   │   ├── routes/           # Protected & Role-Based Routing
│   │   └── lib/                 # Supabase Client
│   ├── index.html           # Main HTML Template
│   ├── vercel.json           # Vercel Deployment Config
│   └── README.md         # Your Current Location
```

---

### 🚀 Vision Behind QNIT

QNIT Aims To **Simplify Academic Resource Access**, Eliminate Scattered Study Materials and Create A **Single Trusted Platform** For Students — While Ensuring Administrators Maintain Complete Control Over Content Quality, Organization and Availability.

---

### 📌 Future Scope

* AI Powered PYQ Solver & Study Assistant
* Global Search Functionality Across All Resources
* Interactive Quiz Section Based On Uploaded Materials
* Advanced Analytics For Admins
* Bookmark & Favorites For Students

----

### 🙋🏻‍♀️ Author

**Sayan Ghosh**  
If You Like This Project or Find It Useful, Don't Forget To Hit The `STAR` Button and Share Your Feedback! You Can Contribute To This Project Too 😎

Feel Free To Connect Me On [LinkedIn](https://www.linkedin.com/in/sayan-ghosh25).