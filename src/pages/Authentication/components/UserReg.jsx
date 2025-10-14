// src/pages/Authentication/components/UserReg.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import styles from "./UserReg.module.css";

// ---------------- CONFIG ----------------
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const WELCOME_REDIRECT = import.meta.env.VITE_WELCOME_REDIRECT;
// ----------------------------------------

const TICK_SVG = (
  <svg className={styles.tickSvg} viewBox="0 0 52 52" aria-hidden="true">
    <circle className={styles.tickCircle} cx="26" cy="26" r="25" fill="none" />
    <path className={styles.tickCheck} fill="none" d="M14 27 l7 7 l17 -17" />
  </svg>
);

// helper: normalize name to
function normalizeNameForLookup(name = "") {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

export default function UserReg() {
  const navigate = useNavigate();

  // form states
  const [userType, setUserType] = useState("");

  // Student fields
  const [fullName, setFullName] = useState("");
  const [stream, setStream] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("");

  // Contact
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");

  // Access key (student) and private key (admin)
  const [accessKey, setAccessKey] = useState("");
  const [accessKeyDisabled, setAccessKeyDisabled] = useState(false);
  const [accessAutoFoundFor, setAccessAutoFoundFor] = useState(null);

  // accessKey validation state: null | "checking" | true | false
  const [accessKeyStatus, setAccessKeyStatus] = useState(null);
  const [accessKeyMessage, setAccessKeyMessage] = useState("");

  // password
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // validation states
  const [userExistsEmailStatus, setUserExistsEmailStatus] = useState(null);
  const [userExistsContactStatus, setUserExistsContactStatus] = useState(null);

  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    upper: false,
    lower: false,
    digit: false,
    special: false,
    noName: false,
  });

  // ---------- Private Key state (admin) ----------
  const [privateKey, setPrivateKey] = useState("");
  const [privateKeyGenerated, setPrivateKeyGenerated] = useState(false);
  const [privateKeyVerified, setPrivateKeyVerified] = useState(false);
  const [privateKeyTimer, setPrivateKeyTimer] = useState(0);
  const privateKeyIntervalRef = useRef(null);
  const [privateKeyMessage, setPrivateKeyMessage] = useState("");

  // submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successModal, setSuccessModal] = useState(false);

  // debounce refs
  const debounceEmailRef = useRef(null);
  const debounceContactRef = useRef(null);
  const debounceNameRef = useRef(null);
  const debounceAccessRef = useRef(null);

  // ---------- VALIDATORS ----------
  function validateEmail(em) {
    if (!em) return false;
    const cleaned = String(em).replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
  }
  function validateContact(c) {
    return /^\d{10}$/.test(c);
  }

  // ---------- PASSWORD CHECKS ----------
  useEffect(() => {
    const checks = {
      length: password.length >= 12,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      digit: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
      noName: false,
    };

    if (password.length > 0) {
      const tokens = fullName
        .split(/\s+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2);
      let ok = true;
      for (const tk of tokens) {
        if (tk && password.toLowerCase().includes(tk)) {
          ok = false;
          break;
        }
      }
      checks.noName = ok;
    }

    setPasswordChecks(checks);
  }, [password, fullName]);

  function allPasswordChecksPass() {
    return Object.values(passwordChecks).every(Boolean);
  }

  // ---------- USER EXISTENCE CHECKS (Profiles Table) ----------
  useEffect(() => {
    if (!email) {
      setUserExistsEmailStatus(null);
      return;
    }
    if (!validateEmail(email)) {
      setUserExistsEmailStatus(null);
      return;
    }

    if (debounceEmailRef.current) clearTimeout(debounceEmailRef.current);
    setUserExistsEmailStatus("checking");
    debounceEmailRef.current = setTimeout(async () => {
      try {
        if (API_BASE_URL) {
          const url = new URL(`${API_BASE_URL}/auth/check-user`);
          url.searchParams.set("field", "email");
          url.searchParams.set("value", email.trim().toLowerCase());
          const res = await fetch(url.toString());
          if (!res.ok) throw new Error("check failed");
          const j = await res.json();
          setUserExistsEmailStatus(Boolean(j.exists));
        } else {
          const { data, error } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", email.trim().toLowerCase())
            .maybeSingle();
          if (error) throw error;
          setUserExistsEmailStatus(Boolean(data?.id));
        }
      } catch (err) {
        console.warn("email check err", err);
        setUserExistsEmailStatus(null);
      }
    }, 500);

    return () => {
      if (debounceEmailRef.current) clearTimeout(debounceEmailRef.current);
    };
  }, [email]);

  useEffect(() => {
    if (!contactNumber) {
      setUserExistsContactStatus(null);
      return;
    }
    if (!validateContact(contactNumber)) {
      setUserExistsContactStatus(null);
      return;
    }

    if (debounceContactRef.current) clearTimeout(debounceContactRef.current);
    setUserExistsContactStatus("checking");
    debounceContactRef.current = setTimeout(async () => {
      try {
        if (API_BASE_URL) {
          const url = new URL(`${API_BASE_URL}/auth/check-user`);
          url.searchParams.set("field", "contact");
          url.searchParams.set("value", contactNumber.trim());
          const res = await fetch(url.toString());
          if (!res.ok) throw new Error("check failed");
          const j = await res.json();
          setUserExistsContactStatus(Boolean(j.exists));
        } else {
          const { data, error } = await supabase
            .from("profiles")
            .select("id")
            .eq("contact", contactNumber.trim())
            .maybeSingle();
          if (error) throw error;
          setUserExistsContactStatus(Boolean(data?.id));
        }
      } catch (err) {
        console.warn("contact check err", err);
        setUserExistsContactStatus(null);
      }
    }, 500);

    return () => {
      if (debounceContactRef.current) clearTimeout(debounceContactRef.current);
    };
  }, [contactNumber]);

  // ---------- STUDENT ACCESS KEY AUTO-FILL ----------
  useEffect(() => {
    if (!fullName || fullName.trim().length < 2) {
      setAccessKey("");
      setAccessKeyDisabled(false);
      setAccessAutoFoundFor(null);
      return;
    }

    if (debounceNameRef.current) clearTimeout(debounceNameRef.current);
    debounceNameRef.current = setTimeout(async () => {
      const normalized = normalizeNameForLookup(fullName);
      if (!normalized) {
        setAccessKey("");
        setAccessKeyDisabled(false);
        setAccessAutoFoundFor(null);
        return;
      }

      try {
        if (API_BASE_URL) {
          const url = new URL(`${API_BASE_URL}/auth/student-id-lookup`);
          url.searchParams.set("name", fullName.trim());
          const res = await fetch(url.toString());
          if (!res.ok) throw new Error("lookup failed");
          const j = await res.json();
          if (j && j.found && j.id4) {
            setAccessKey(String(j.id4));
            setAccessKeyDisabled(true);
            setAccessAutoFoundFor(j.original_name || null);
          } else {
            setAccessKey("");
            setAccessKeyDisabled(false);
            setAccessAutoFoundFor(null);
          }
        } else {
          const { data, error } = await supabase
            .from("student_ids")
            .select("id4, original_name")
            .eq("normalized_name", normalized)
            .maybeSingle();

          if (error) {
            console.warn("student id lookup error", error);
            setAccessKeyDisabled(false);
            setAccessAutoFoundFor(null);
            return;
          }

          if (data && data.id4) {
            setAccessKey(String(data.id4));
            setAccessKeyDisabled(true);
            setAccessAutoFoundFor(data.original_name || null);
          } else {
            setAccessKey("");
            setAccessKeyDisabled(false);
            setAccessAutoFoundFor(null);
          }
        }
      } catch (err) {
        console.warn("student lookup err", err);
        setAccessKeyDisabled(false);
        setAccessAutoFoundFor(null);
      }
    }, 450);

    return () => {
      if (debounceNameRef.current) clearTimeout(debounceNameRef.current);
    };
  }, [fullName]);

  // ---------- ACCESS KEY LIVE VALIDATION (client-side best-effort) ----------
  useEffect(() => {
    // Only validate for Student role; if disabled (auto found) still validate existence/usage
    const isStudent = userType === "Student";
    if (!isStudent) {
      setAccessKeyStatus(null);
      setAccessKeyMessage("");
      return;
    }

    // if empty, clear
    if (!accessKey || accessKey.trim().length === 0) {
      setAccessKeyStatus(null);
      setAccessKeyMessage("");
      return;
    }

    // debounce
    if (debounceAccessRef.current) clearTimeout(debounceAccessRef.current);
    setAccessKeyStatus("checking");
    setAccessKeyMessage("Checking...");

    debounceAccessRef.current = setTimeout(async () => {
      try {
        const keyRaw = String(accessKey).trim();
        let found = null;

        // try id4 lookup (exact)
        const { data: byId4, error: id4Err } = await supabase
          .from("student_ids")
          .select("id4, original_name, normalized_name")
          .eq("id4", keyRaw)
          .maybeSingle();

        if (!id4Err && byId4 && byId4.id4) {
          found = byId4;
        } else {
          const normalized = keyRaw.toLowerCase().replace(/\s+/g, "");
          const { data: byNorm, error: normErr } = await supabase
            .from("student_ids")
            .select("id4, original_name, normalized_name")
            .eq("normalized_name", normalized)
            .maybeSingle();

          if (!normErr && byNorm && byNorm.id4) {
            found = byNorm;
          }
        }

        if (!found && !password.length > 0) {
          setAccessKeyStatus(false);
          setAccessKeyMessage("Invalid Key! No matching student record found");
          return;
        }

        // check if profiles already use this access_key
        const { data: usedBy, error: usedErr } = await supabase
          .from("profiles")
          .select("id, email")
          .eq("access_key", found.id4)
          .maybeSingle();

        if (usedErr) {
          console.warn("accessKey validation: profiles lookup error", usedErr);
        }

        if (usedBy && usedBy.id) {
          setAccessKeyStatus(false);
          setAccessKeyMessage("This access key is associated with another student");
          return;
        }

        // success
        setAccessKeyStatus(true);
        setAccessKeyMessage("Access Key Is Valid");
        // if it was auto-found, keep disabled flag as-is
      } catch (err) {
        console.error("accessKey validation failed:", err);
        setAccessKeyStatus(null);
        setAccessKeyMessage("Unable to validate access key right now");
      }
    }, 420);

    return () => {
      if (debounceAccessRef.current) clearTimeout(debounceAccessRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, userType]);

  // ========== PRIVATE KEY REQUEST (Admin) ==========
  async function handleRequestPrivateKeyInput() {
    setPrivateKeyMessage("");
    if (!((email && validateEmail(email)) || (contactNumber && validateContact(contactNumber)))) {
      setPrivateKeyMessage("Enter your valid email & contact first");
      return;
    }

    try {
      setPrivateKeyMessage("Requesting for private key...");
      if (API_BASE_URL) {
        const res = await fetch(`${API_BASE_URL}/auth/private-key/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userType: userType.toLowerCase(),
            email: email?.trim()?.toLowerCase() || null,
            contact: contactNumber?.trim() || null,
            purpose: "signup",
          }),
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message || "Private key generation failed");
        }

        // don't expose server response; just show success message
        setPrivateKeyGenerated(true);
        setPrivateKeyVerified(false);
        setPrivateKeyMessage("Request Sent! Contact Super Admin To Receive Your Private Key");

        setPrivateKeyTimer(600);
        if (privateKeyIntervalRef.current) clearInterval(privateKeyIntervalRef.current);
        privateKeyIntervalRef.current = setInterval(() => {
          setPrivateKeyTimer((t) => {
            if (t <= 1) {
              clearInterval(privateKeyIntervalRef.current);
              privateKeyIntervalRef.current = null;
              return 0;
            }
            return t - 1;
          });
        }, 1000);
      } else {
        throw new Error("Server-side Error");
      }
    } catch (err) {
      console.error("private key gen error", err);
      setPrivateKeyMessage(err.message || "Failed to generate private key");
    }
  }

  async function handleVerifyPrivateKeyInput() {
    setPrivateKeyMessage("");
    if (!privateKeyGenerated) {
      setPrivateKeyMessage("Request private key first");
      return;
    }
    if (!privateKey || privateKey.trim().length < 5) {
      setPrivateKeyMessage("Enter your private key");
      return;
    }

    try {
      if (!API_BASE_URL) throw new Error("Server-side Error");

      const res = await fetch(`${API_BASE_URL}/auth/private-key/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userType: userType.toLowerCase(),
          email: email?.trim()?.toLowerCase() || null,
          contact: contactNumber?.trim() || null,
          privateKey: privateKey.trim(),
          purpose: "signup",
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Private key verification failed");
      }

      const data = await res.json();
      setPrivateKeyVerified(data.verified || false);
      setPrivateKeyMessage(data.verified ? "Private Key Verified Successfully!" : "Verification failed");
      if (privateKeyIntervalRef.current) {
        clearInterval(privateKeyIntervalRef.current);
        privateKeyIntervalRef.current = null;
      }
      setPrivateKeyTimer(0);
    } catch (err) {
      console.error("private key verify error", err);
      setPrivateKeyMessage(err.message || "Failed to verify private key");
    }
  }

  // ---------- Final Registration (With Email Auth) ----------
  async function handleCreateAccount(e) {
    e.preventDefault();
    setFormError("");

    const isStudent = userType === "Student";
    const isAdmin = userType === "Admin";

    // minimal validation
    if (!isStudent && !isAdmin) {
      setFormError("Select a valid user type");
      return;
    }
    if (isStudent) {
      if (!fullName.trim()) {
        setFormError("Enter your full name");
        return;
      }
      if (!stream.trim()) {
        setFormError("Enter your stream");
        return;
      }
      if (!yearOfStudy.trim()) {
        setFormError("Enter your academic year");
        return;
      }
      if (!(email || contactNumber)) {
        setFormError("Provide your email or contact");
        return;
      }
      // ensure accessKey validation passed (client-side best-effort)
      if (!accessKey || accessKey.trim().length < 1) {
        setFormError("Access key is required");
        return;
      }
      if (accessKeyStatus !== true && !API_BASE_URL) {
        // if server API exists we will re-validate on server; otherwise block if client-side check failed
        setFormError(accessKeyMessage || "Invalid access key");
        return;
      }
    }
    if (isAdmin) {
      if (!fullName.trim()) {
        setFormError("Enter your full name");
        return;
      }
      if (!email) {
        setFormError("Admin registration requires an email");
        return;
      }
      if (!privateKeyVerified) {
        setFormError("Verify private key first or request one");
        return;
      }
    }

    if (email && !validateEmail(email)) {
      setFormError("Invalid email");
      return;
    }
    if (contactNumber && !validateContact(contactNumber)) {
      setFormError("Invalid contact");
      return;
    }

    if (!allPasswordChecksPass()) {
      setFormError("Password does not meet requirements");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1) If API backend exists, run full validation on server (preferred)
      if (API_BASE_URL) {
        const payload = {
          email: email?.trim().toLowerCase() || null,
          password,
          role: isAdmin ? "admin" : "student",
          full_name: fullName.trim(),
          contact: contactNumber ? contactNumber.trim() : null,
          stream: isStudent ? stream.trim() : null,
          year_of_study: isStudent ? yearOfStudy.trim() : null,
          access_key: isStudent ? (accessKey && accessKey.trim().length ? accessKey.trim() : null) : null,
        };

        const res = await fetch(`${API_BASE_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const j = await res.json().catch(() => null);
        if (!res.ok || !j || j.ok !== true) {
          const em = (j && (j.error || j.message)) || "Validation failed on server";
          throw new Error(em);
        }
      } else {}

      // 2) signUp via supabase client (triggers confirmation email)
      const signPayload = {
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            role: isAdmin ? "admin" : "student",
            full_name: fullName.trim(),
            contact: contactNumber ? contactNumber.trim() : null,
            stream: isStudent ? stream.trim() : null,
            year_of_study: isStudent ? yearOfStudy.trim() : null,
            access_key: isStudent ? (accessKey && accessKey.trim().length ? accessKey.trim() : null) : null,
          },
          emailRedirectTo: WELCOME_REDIRECT,
        },
      };

      const result = await supabase.auth.signUp(signPayload);
      const signErr = result?.error || result?.data?.error || null;
      if (signErr) throw signErr;

      // success - show helpful modal and clear sensitive fields
      setSuccessModal(true);
      setPassword("");
      setConfirmPassword("");

      // Hide modal and return to landing (Welcome page will be used when user clicks confirmation link)
      setTimeout(() => {
        setSuccessModal(false);
        try {
          navigate("/", { replace: true });
        } catch (e) {
          // fallback
          window.location.href = "/";
        }
      }, 3000);
    } catch (err) {
      console.error("register error", err);
      const msg = err?.message || String(err) || "Registration Failed! Try Again...";
      if (/already exists|duplicate|user exists/i.test(msg)) {
        setFormError("An account with this email already exists! Try signing in or use password reset");
      } else {
        setFormError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // cleanup intervals & timers
  useEffect(() => {
    return () => {
      if (privateKeyIntervalRef.current) {
        clearInterval(privateKeyIntervalRef.current);
        privateKeyIntervalRef.current = null;
      }
      if (debounceEmailRef.current) clearTimeout(debounceEmailRef.current);
      if (debounceContactRef.current) clearTimeout(debounceContactRef.current);
      if (debounceNameRef.current) clearTimeout(debounceNameRef.current);
      if (debounceAccessRef.current) clearTimeout(debounceAccessRef.current);
    };
  }, []);

  // ---------- UI render ----------
  const isStudent = userType === "Student";
  const isAdmin = userType === "Admin";
  const signUpEnabled = (() => {
    if (!isStudent && !isAdmin) return false;
    if (isStudent) {
      if (!fullName.trim() || !stream.trim() || !yearOfStudy.trim()) return false;
      if (!allPasswordChecksPass()) return false;
      if (password !== confirmPassword) return false;
      if (!accessKey || accessKey.trim().length < 1) return false;
      // if no API backend and client-side accessKey check failed -> disable
      if (!API_BASE_URL && accessKeyStatus !== true) return false;
    }
    if (isAdmin) {
      if (!fullName.trim() || !email.trim()) return false;
      if (!privateKeyVerified) return false;
      if (!allPasswordChecksPass()) return false;
      if (password !== confirmPassword) return false;
    }
    return true;
  })();

  return (
    <div className={styles.uregPage}>
      <div className={styles.uregContainer}>
        <header className={styles.uregHeader}>
          <h1>New User Registration</h1>
        </header>

        <form className={styles.uregForm} onSubmit={handleCreateAccount} noValidate>
          <div className={styles.field}>
            <label>User Type</label>
            <select
              value={userType}
              onChange={(e) => {
                setUserType(e.target.value);
                // Reset related flags on switching
                setPrivateKey("");
                setPrivateKeyGenerated(false);
                setPrivateKeyVerified(false);
                setPrivateKeyMessage("");
                setPrivateKeyTimer(0);
                setAccessKey("");
                setAccessKeyDisabled(false);
                setAccessAutoFoundFor(null);
                setAccessKeyStatus(null);
                setAccessKeyMessage("");
              }}
              required
            >
              <option value="" disabled>
                -- Select --
              </option>
              <option value="Student">Student</option>
              <option value="Admin">Admin</option>
            </select>
          </div>

          {(isStudent || isAdmin) && (
            <div className={styles.panel}>
              <div className={styles.field}>
                <label>Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter Your Full Name" required />
              </div>

              {isStudent && (
                <>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label>Stream</label>
                      <input value={stream} onChange={(e) => setStream(e.target.value)} placeholder="Enter Your Stream" required />
                    </div>
                    <div className={styles.field}>
                      <label>Academic Year</label>
                      <input value={yearOfStudy} onChange={(e) => setYearOfStudy(e.target.value)} placeholder="Enter Your Year of Study" required />
                    </div>
                  </div>
                </>
              )}

              <div className={styles.row2}>
                <div className={styles.field}>
                  <label>Contact Number</label>
                  <input
                    value={contactNumber}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setContactNumber(v);
                    }}
                    placeholder="Enter Your Contact Number"
                    aria-describedby="contactHelp"
                  />
                  <div className={styles.statusRow} style={{ marginTop: "4px", marginLeft: "6px" }}>
                    {contactNumber && !validateContact(contactNumber) && <span className={`${styles.note} ${styles.error}`}>Contact must be exactly 10 digits</span>}
                    {userExistsContactStatus === "checking" && <span className={styles.note}>Checking availability...</span>}
                    {userExistsContactStatus === true && validateContact(contactNumber) && <span className={`${styles.note} ${styles.error}`}>Contact already exists! Use different contact or try signing in</span>}
                    {userExistsContactStatus === false && validateContact(contactNumber) && <span className={`${styles.note} ${styles.success}`}>Contact not registered yet</span>}
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Email ID</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value.replace(/[\u200B-\u200D\uFEFF]/g, ""))}
                    onBlur={() => setEmail((v) => String(v || "").trim())}
                    placeholder="Enter Your Email ID"
                  />
                  <div className={styles.statusRow} style={{ marginTop: "4px", marginLeft: "6px" }}>
                    {email && !validateEmail(email) && <span className={`${styles.note} ${styles.error}`}>Invalid email format</span>}
                    {userExistsEmailStatus === "checking" && <span className={styles.note}>Checking availability...</span>}
                    {userExistsEmailStatus === true && validateEmail(email) && <span className={`${styles.note} ${styles.error}`}>Email already exists! Use different email or try signing in</span>}
                    {userExistsEmailStatus === false && validateEmail(email) && <span className={`${styles.note} ${styles.success}`}>Email not registered yet</span>}
                  </div>
                </div>
              </div>

              {/* Access Key (Student) */}
              {isStudent && (
                <div className={styles.field}>
                  <label>Access Key</label>
                  <input
                    value={accessKey}
                    onChange={(e) => {
                      if (accessKeyDisabled) return;
                      setAccessKey(e.target.value.replace(/\D/g, "").slice(0, 4));
                    }}
                    placeholder="E.g. NIT/2023/XXXX"
                    disabled={accessKeyDisabled}
                  />
                  <div>
                    {accessAutoFoundFor && <small className={styles.hint} style={{ color: "#2ecc71" }}>System Auto-filled, No Change Needed</small>}
                    {accessKeyStatus === "checking" && <small className={styles.hint}>Validating Access Key...</small>}
                    {accessKeyStatus === true && <small className={`${styles.hint} ${styles.success}`}>{accessKeyMessage}</small>}
                    {accessKeyStatus === false && <small className={`${styles.hint} ${styles.error}`}>{accessKeyMessage}</small>}
                  </div>
                </div>
              )}

              {/* Private Key (Admin) */}
              {isAdmin && (
                <div className={styles.keyRow}>
                  <div className={`${styles.field} ${styles.keyField}`}>
                    <label>Private Key</label>
                    <div className={styles.keyControls}>
                      <input value={privateKey} onChange={(e) => setPrivateKey(e.target.value.trim())} placeholder="Enter The Private Key" disabled={privateKeyVerified} />
                      <div className={styles.keyButtons}>
                        <button type="button" className={`${styles.btn} ${styles.small} ${styles.outline}`} onClick={handleRequestPrivateKeyInput} disabled={privateKeyVerified || (privateKeyGenerated && privateKeyTimer > 0)}>
                          {!privateKeyGenerated ? "Request" : "Request Again"}
                        </button>
                        <button type="button" className={`${styles.btn} ${styles.small} ${styles.outline}`} onClick={handleVerifyPrivateKeyInput} disabled={!privateKeyGenerated || privateKeyVerified}>
                          Verify
                        </button>
                      </div>
                    </div>
                    <div className={styles.noteRow}>
                      {privateKeyMessage && <small className={`${styles.hint} ${privateKeyVerified ? styles.success : privateKeyMessage.toLowerCase().includes("failed") || privateKeyMessage.toLowerCase().includes("wrong") ? styles.error : ""}`} style={{ marginTop: "-4px" }}>{privateKeyMessage}</small>}
                      {privateKeyGenerated && privateKeyTimer > 0 && <small className={styles.hint}>Resend in 00:{String(Math.floor(privateKeyTimer / 60)).padStart(2, "0")}:{String(privateKeyTimer % 60).padStart(2, "0")}</small>}
                    </div>
                  </div>
                </div>
              )}

              {/*Password */}
              <div className={styles.field}>
                <label>Create Password</label>
                <div className={styles.pwdWrap}>
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => { const cleaned = e.target.value.replace(/\s/g, ""); setPassword(cleaned); }} placeholder="Enter Your Password" aria-describedby="pwdGuide" />
                  <button type="button" className={styles.eye} onClick={() => setShowPassword((s) => !s)} aria-label="Toggle password visibility">{showPassword ? "Hide" : "Show"}</button>
                </div>
                <div id="pwdGuide" className={styles.pwdChecks} style={{ display: password.length > 0 ? "grid" : "none" }}>
                  <div className={`${styles.check} ${passwordChecks.length ? styles.ok : ""}`}>Minimum 12 Characters</div>
                  <div className={`${styles.check} ${passwordChecks.upper ? styles.ok : ""}`}>Contains One Uppercase</div>
                  <div className={`${styles.check} ${passwordChecks.lower ? styles.ok : ""}`}>Contains One Lowercase</div>
                  <div className={`${styles.check} ${passwordChecks.digit ? styles.ok : ""}`}>Contains One Digit</div>
                  <div className={`${styles.check} ${passwordChecks.special ? styles.ok : ""}`}>Contains One Special Character</div>
                  <div className={`${styles.check} ${passwordChecks.noName ? styles.ok : ""}`}>Does Not Include Your Name</div>
                </div>
              </div>

              <div className={styles.field}>
                <label>Confirm Password</label>
                <div className={styles.pwdWrap}>
                  <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value.replace(/\s/g, ""))} placeholder="Re-Enter Your Password" />
                  <button type="button" className={styles.eye} onClick={() => setShowConfirmPassword((s) => !s)}>{showConfirmPassword ? "Hide" : "Show"}</button>
                </div>
                {confirmPassword && confirmPassword !== password && <small className={`${styles.hint} ${styles.error}`}>Passwords do not match</small>}
                {confirmPassword && confirmPassword === password && <small className={`${styles.hint} ${styles.success}`}>Passwords matched</small>}
              </div>

              {formError && <div className={styles.formError}>{formError}</div>}

              <div className={styles.actions}>
                <button type="submit" className={`${styles.btn} ${styles.primary}`} disabled={!signUpEnabled || isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className={styles.spinnerInline} aria-hidden="true"><i className="fas fa-hourglass-start"></i></span>
                      Processing...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </button>
                <button type="button" className={`${styles.btn} ${styles.cancel}`} onClick={() => navigate("/")}>Cancel Process</button>
              </div>
            </div>
          )}
        </form>

        <footer className={styles.uregFooter}>
          Already have an account?{' '}
          <button onClick={() => { try { navigate('/SignIn'); } catch (e) {} }}>
            Sign In
          </button>
        </footer>
      </div>

      {/* Success modal overlay */}
      {successModal && (
        <div className={styles.successPop} aria-hidden={false}>
          {TICK_SVG}
          <p>Congratulations! <br/> Verify Your Email To <br/> Complete The Registration</p>
        </div>
      )}
    </div>
  );
}