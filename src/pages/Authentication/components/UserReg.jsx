// src/pages/Authentication/components/UserReg.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/context/AuthContext";
import styles from "./UserReg.module.css";

// ---------------- CONFIG ----------------
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const OTP_TIMEOUT_SECONDS = 10 * 60; // 10 minutes
const PRIVATE_KEY_TIMEOUT_SECONDS = 10 * 60; // 10 minutes
const OTP_MAX_ATTEMPTS = 5; // server should enforce; UI shows count
const ACCESS_MAX_WRONG = 3; // server should enforce ban; UI will reflect server response
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
  const { login } = useAuth();

  // form states
  const [userType, setUserType] = useState(""); // "Student" | "Admin"

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

  // password
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // validation states
  const [userExistsEmailStatus, setUserExistsEmailStatus] = useState(null); // null | true | false | "checking"
  const [userExistsContactStatus, setUserExistsContactStatus] = useState(null);

  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    upper: false,
    lower: false,
    digit: false,
    special: false,
    noName: false,
  });

  // OTP flow (assumes API_BASE_URL OTP endpoints, fallback: disabled)
  const [otp, setOtp] = useState("");
  const [otpGenerated, setOtpGenerated] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const otpIntervalRef = useRef(null);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpRequestsCount, setOtpRequestsCount] = useState(0);

  // ---------- Private Key state ----------
  const [privateKey, setPrivateKey] = useState(""); // stores the generated/entered private key
const [privateKeyGenerated, setPrivateKeyGenerated] = useState(false);
const [privateKeyVerified, setPrivateKeyVerified] = useState(false);
const [privateKeyTimer, setPrivateKeyTimer] = useState(0); // optional if you want expiration like OTP
const privateKeyIntervalRef = useRef(null); // for countdown timer
const [privateKeyMessage, setPrivateKeyMessage] = useState("");

  // access/private key ban metadata (relies on server ideally)
  const [accessWrongCount, setAccessWrongCount] = useState(0);
  const [accessBanExpiry, setAccessBanExpiry] = useState(null);

  // submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [successModal, setSuccessModal] = useState(false);

  // debounce refs
  const debounceEmailRef = useRef(null);
  const debounceContactRef = useRef(null);
  const debounceNameRef = useRef(null);

  // helper: format seconds
  function formatHMS(s) {
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  // ---------- VALIDATORS ----------
  function validateEmail(em) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
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

  // ---------- USER EXISTENCE CHECKS (profiles table) ----------
  // email
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
        // Prefer server endpoint if provided (because only server can use service_role to access auth.users)
        if (API_BASE_URL) {
          const url = new URL(`${API_BASE_URL}/auth/check-user`);
          url.searchParams.set("field", "email");
          url.searchParams.set("value", email.trim().toLowerCase());
          const res = await fetch(url.toString());
          if (!res.ok) throw new Error("check failed");
          const j = await res.json();
          setUserExistsEmailStatus(Boolean(j.exists));
        } else {
          // Client-side: check profiles table for email (requires that you store email in profiles at signup)
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

  // contact
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
  // whenever fullName changes (debounced), try lookup in student_ids table
  useEffect(() => {
    if (!fullName || fullName.trim().length < 2) {
      setAccessKey("");
      setAccessKeyDisabled(false);
      return;
    }

    if (debounceNameRef.current) clearTimeout(debounceNameRef.current);
    debounceNameRef.current = setTimeout(async () => {
      const normalized = normalizeNameForLookup(fullName);
      if (!normalized) {
        setAccessKey("");
        setAccessKeyDisabled(false);
        return;
      }

      try {
        // Query student_ids table in Supabase: expects columns normalized_name, id4
        const { data, error } = await supabase
          .from("student_ids")
          .select("id4, original_name")
          .eq("normalized_name", normalized)
          .maybeSingle();

        if (error) {
          console.warn("student id lookup error", error);
          setAccessKeyDisabled(false);
          return;
        }

        if (data && data.id4) {
          // found -> autofill and disable
          setAccessKey(String(data.id4));
          setAccessKeyDisabled(true);
        } else {
          // not found -> allow manual entry
          setAccessKey("");
          setAccessKeyDisabled(false);
        }
      } catch (err) {
        console.warn("student lookup err", err);
        setAccessKeyDisabled(false);
      }
    }, 450);

    return () => {
      if (debounceNameRef.current) clearTimeout(debounceNameRef.current);
    };
  }, [fullName]);

  // ---------- PRIVATE KEY REQUEST (Admin) ----------
  // We implement using a Supabase RPC or insert to admin_key_requests table. The server (or a DB trigger/edge function) must send the email.

  async function handleRequestPrivateKeyInput() {
    setPrivateKeyMessage("");
    // require either a valid email or a valid contact number
    if (!((email && validateEmail(email)) || (contactNumber && validateContact(contactNumber)))) {
      setPrivateKeyMessage("Enter a valid email or a valid 10-digit contact to receive private key");
      return;
     }

    try {
      setPrivateKeyMessage("Generating private key...");
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

        const data = await res.json();
        setPrivateKeyGenerated(true);
        setPrivateKeyVerified(false);
        setPrivateKeyMessage("Private key generated!");

        setPrivateKeyTimer(PRIVATE_KEY_TIMEOUT_SECONDS);
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
        throw new Error(
          "No backend configured for private key. Set API_BASE_URL or implement server-side key generation."
        );
      }
    } catch (err) {
      console.error("private key gen err", err);
      setPrivateKeyMessage(err.message || "Failed to generate private key");
    }
  }

  async function handleVerifyPrivateKeyInput() {
    setPrivateKeyMessage("");
    if (!privateKeyGenerated) {
      setPrivateKeyMessage("Generate private key first");
      return;
    }
    if (!privateKey || privateKey.trim().length < 5) {
      setPrivateKeyMessage("Enter private key");
      return;
    }

    try {
      if (!API_BASE_URL) throw new Error("No backend configured for private key verification");

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
      setPrivateKeyMessage(data.verified ? "Private key verified successfully!" : "Verification failed");
      if (privateKeyIntervalRef.current) {
        clearInterval(privateKeyIntervalRef.current);
        privateKeyIntervalRef.current = null;
      } setPrivateKeyTimer(0);      

    } catch (err) {
      console.error("private key verify err", err);
      setPrivateKeyMessage(err.message || "Failed to verify private key");
    }
  }

  // ---------- OTP generation & verify (server-backed) ----------
  // These call API_BASE_URL endpoints. If you prefer, implement an edge-function that talks to SendGrid/Supabase SMTP.
  async function handleGenerateOtp() {
    setOtpMessage("");
    if (!email && !contactNumber) {
      setOtpMessage("Enter an email or contact to receive OTP");
      return;
    }
    if (email && !validateEmail(email)) {
      setOtpMessage("Enter a valid email");
      return;
    }
    if (contactNumber && !validateContact(contactNumber)) {
      setOtpMessage("Enter a valid 10-digit phone number");
      return;
    }

    try {
      setOtpMessage("Sending OTP...");
      if (API_BASE_URL) {
        const res = await fetch(`${API_BASE_URL}/auth/otp/generate`, {
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
          throw new Error(j.message || "OTP generation failed");
        }
      } else {
        // If you don't have a backend, you must configure SMS/Email service — otherwise we can't send OTP from frontend securely.
        throw new Error("No OTP backend configured. Set API_BASE_URL to your server or integrate Supabase SMS/Email on the backend.");
      }

      setOtpGenerated(true);
      setOtpVerified(false);
      setOtpTimer(OTP_TIMEOUT_SECONDS);
      setOtpMessage("OTP sent! Check your email / phone");
      setOtpRequestsCount((c) => c + 1);
      // start timer
      if (otpIntervalRef.current) clearInterval(otpIntervalRef.current);
      otpIntervalRef.current = setInterval(() => {
        setOtpTimer((t) => {
          if (t <= 1) {
            clearInterval(otpIntervalRef.current);
            otpIntervalRef.current = null;
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } catch (err) {
      console.error("otp gen err", err);
      setOtpMessage(err.message || "Failed to send OTP");
    }
  }

  async function handleVerifyOtp() {
    setOtpMessage("");
    if (!otpGenerated) {
      setOtpMessage("Request OTP first");
      return;
    }
    if (!otp || otp.trim().length < 3) {
      setOtpMessage("Enter OTP");
      return;
    }

    try {
      if (API_BASE_URL) {
        const res = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userType: userType.toLowerCase(),
            email: email?.trim()?.toLowerCase() || null,
            contact: contactNumber?.trim() || null,
            otp,
            purpose: "signup",
          }),
        });
        const j = await res.json();
        if (!res.ok || !j.verified) throw new Error(j.message || "OTP verification failed");
        setOtpVerified(true);
        setOtpMessage("OTP verified");
        // clear timer
        if (otpIntervalRef.current) {
          clearInterval(otpIntervalRef.current);
          otpIntervalRef.current = null;
        }
        setOtpTimer(0);
      } else {
        throw new Error("No OTP backend configured; cannot verify OTP.");
      }
    } catch (err) {
      console.error("verify otp err", err);
      setOtpMessage(err.message || "OTP verification failed");
      setOtpVerified(false);
    }
  }

  // ---------- Final registration ----------
  async function handleCreateAccount(e) {
    e.preventDefault();
    setFormError("");

    const isStudent = userType === "Student";
    const isAdmin = userType === "Admin";

    // minimal validation
    if (!isStudent && !isAdmin) {
      setFormError("Select a valid user type.");
      return;
    }
    if (isStudent) {
      if (!fullName.trim()) { setFormError("Enter full name"); return; }
      if (!stream.trim()) { setFormError("Enter stream"); return; }
      if (!yearOfStudy.trim()) { setFormError("Enter academic year"); return; }
      if (!(email || contactNumber)) { setFormError("Provide email or contact"); return; }
    }
    if (isAdmin) {
      if (!fullName.trim()) { setFormError("Enter full name"); return; }
      if (!email) { setFormError("Admin registration requires an email"); return; }
      if (!privateKeyVerified) { setFormError("Verify private key first or request one."); return; }
    }

    if (email && !validateEmail(email)) { setFormError("Invalid email"); return; }
    if (contactNumber && !validateContact(contactNumber)) { setFormError("Invalid contact"); return; }

    if (!otpVerified) {
      setFormError("Please verify OTP before submitting.");
      return;
    }

    if (!allPasswordChecksPass()) { setFormError("Password does not meet complexity requirements."); return; }
    if (password !== confirmPassword) { setFormError("Passwords do not match."); return; }

    setIsSubmitting(true);

    try {
      // Use Supabase signUp (email/password). For sign-ups without email, you need a backend flow — here we require email.
      if (!email) {
        throw new Error("Registration currently requires an email address. Please enter email.");
      }

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
          },
        },
      };

      // signUp
      const { data: signData, error: signErr } = await supabase.auth.signUp(signPayload);
      if (signErr) throw signErr;

      // If your Supabase requires email confirmation, user will have to confirm via email. We create a profiles row if possible.
      // If `user` object present immediately (depends on settings) we can insert profile now, otherwise create a DB trigger or server function to create profile after confirmation.
      const userId = signData?.user?.id ?? null;
      try {
        if (userId) {
          // insert into profiles
          const nowIso = new Date().toISOString();
          const { error: profileErr } = await supabase.from("profiles").upsert(
            [
              {
                id: userId,
                full_name: fullName.trim(),
                email: email.trim().toLowerCase(),
                contact: contactNumber ? contactNumber.trim() : null,
                role: isAdmin ? "admin" : "student",
                stream: isStudent ? stream.trim() : null,
                year_of_study: isStudent ? yearOfStudy.trim() : null,
                last_password_change: nowIso,
                access_key: isStudent ? accessKey || null : null,
              },
            ],
            { onConflict: "id", returning: "minimal" }
          );
          if (profileErr) {
            console.warn("profiles upsert failed:", profileErr);
            // not fatal; advise server-side fix
          }
        } else {
          // userId not available immediately (email confirmation flow). Recommend creating a server-side webhook to create profiles on signup confirmation.
          console.info("User id not returned immediately (email confirm flow). Ensure server-side profile creation on signup confirmation.");
        }
      } catch (err) {
        console.warn("profile creation err", err);
      }

      // If private key used, mark it as consumed (server-side preferred)
      if (privateKeyVerified) {
        try {
          await supabase
            .from("admin_private_keys")
            .update({ used: true, used_by: signData?.user?.id ?? null, used_at: new Date().toISOString() })
            .eq("code", privateKey.trim());
        } catch (err) {
          // Not fatal on client
          console.warn("Failed to mark private key used:", err);
        }
      }

      // show success and optionally sign in automatically if session created
      setSuccessModal(true);
      setTimeout(async () => {
        setSuccessModal(false);
        // Attempt to sign in automatically (if signData.user exists)
        try {
          if (signData?.user) {
            // sign in state already set by supabase-js; you can navigate to dashboard
            // If email confirm required, redirect to a "please confirm your email" page instead
            if (signData.user.email_confirmed_at || true) {
              // best-effort: fetch session
              navigate(isAdmin ? "/Admin/Dashboard" : "/User/Dashboard", { replace: true });
            } else {
              // instruct user to confirm
              navigate("/", { replace: true });
            }
          } else {
            // email confirmation required — send user to landing page
            navigate("/", { replace: true });
          }
        } catch (navErr) {
          console.warn("navigate after signup failed", navErr);
          navigate("/", { replace: true });
        }
      }, 1300);
    } catch (err) {
      console.error("register err", err);
      setFormError(err?.message || "Registration failed. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // cleanup intervals
  useEffect(() => {
    return () => {
      if (otpIntervalRef.current) {
        clearInterval(otpIntervalRef.current);
        otpIntervalRef.current = null;
      }
      if (privateKeyIntervalRef.current) {
        clearInterval(privateKeyIntervalRef.current);
        privateKeyIntervalRef.current = null;
      }
    };
  }, []);

  // ---------- UI render ----------
  const isStudent = userType === "Student";
  const isAdmin = userType === "Admin";
  const signUpEnabled = (() => {
    if (!isStudent && !isAdmin) return false;
    if (isStudent) {
      if (!fullName.trim() || !stream.trim() || !yearOfStudy.trim()) return false;
      if (!otpVerified) return false;
      if (!allPasswordChecksPass()) return false;
      if (password !== confirmPassword) return false;
      if (!accessKey || accessKey.trim().length < 1) return false; // may be auto-filled or provided
    }
    if (isAdmin) {
      if (!fullName.trim() || !email.trim()) return false;
      if (!otpVerified) return false;
      if (!allPasswordChecksPass()) return false;
      if (password !== confirmPassword) return false;
      if (!privateKeyVerified) return false;
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
                // reset OTP & related flags on switching
                setOtpGenerated(false);
                setOtpVerified(false);
                setOtpMessage("");
                setOtpTimer(0);
                setOtp("");

                setPrivateKey("");
                setPrivateKeyGenerated(false);
                setPrivateKeyVerified(false);
                setPrivateKeyMessage("");
                setPrivateKeyTimer(0);

                setAccessKey("");
                setAccessKeyDisabled(false);
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
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter Your Full Name"
                  required
                />
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
                    {contactNumber && !validateContact(contactNumber) && <span className={`${styles.note} ${styles.error}`}>Phone must be exactly 10 digits</span>}
                    {userExistsContactStatus === "checking" && <span className={styles.note}>Checking availability...</span>}
                    {userExistsContactStatus === true && validateContact(contactNumber) && (
                      <span className={`${styles.note} ${styles.error}`}>Contact already exists! Use different contact or try signing in</span>
                    )}
                    {userExistsContactStatus === false && validateContact(contactNumber) && (
                      <span className={`${styles.note} ${styles.success}`}>Contact not registered yet</span>
                    )}
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Email ID</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter Your Email ID"
                  />
                  <div className={styles.statusRow} style={{ marginTop: "4px", marginLeft: "6px" }}>
                    {email && !validateEmail(email) && <span className={`${styles.note} ${styles.error}`}>Invalid email format</span>}
                    {userExistsEmailStatus === "checking" && <span className={styles.note}>Checking availability...</span>}
                    {userExistsEmailStatus === true && validateEmail(email) && (
                      <span className={`${styles.note} ${styles.error}`}>Email already exists! Use different email or try signing in</span>
                    )}
                    {userExistsEmailStatus === false && validateEmail(email) && (
                      <span className={`${styles.note} ${styles.success}`}>Email not registered yet</span>
                    )}
                  </div>
                </div>
              </div>

              {/* OTP area */}
              <div className={styles.otpRow}>
                <div className={`${styles.field} ${styles.otpField}`}>
                  <label>OTP</label>
                  <div className={styles.otpControls}>
                    <input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="Enter OTP"
                      readOnly={otpVerified}
                      disabled={otpVerified}
                    />
                    <div className={styles.otpButtons}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.small} ${styles.outline}`}
                        onClick={handleGenerateOtp}
                        disabled={ otpVerified || (otpGenerated && otpTimer > 0)}
                      >
                        {!otpGenerated ? "Send OTP" : "Resend OTP"}
                      </button>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.small} ${styles.outline}`}
                        onClick={handleVerifyOtp}
                        disabled={!otpGenerated || otpVerified}
                      >
                        Verify
                      </button>
                    </div>
                  </div>
                  <div className={styles.noteRow}>
                    {otpMessage && (
                      <small className={`${styles.hint} ${otpVerified ? styles.success : otpMessage.toLowerCase().includes("failed") || otpMessage.toLowerCase().includes("wrong") ? styles.error : ""}`} style={{ marginTop: "-4px" }}>
                        {otpMessage}
                      </small>
                    )}
                    {otpGenerated && otpTimer > 0 && <small className={styles.hint}>Resend in {formatHMS(otpTimer)}</small>}
                  </div>
                </div>
              </div>

              {/* access key (student) */}
              {isStudent && (
                <div className={styles.field}>
                  <label>Access Key</label>
                  <input
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="e.g. NIT/2023/XXXX"
                    disabled={accessKeyDisabled}
                  />
                </div>
              )}

              {/* private key (admin) */}
              {isAdmin && (
                <div className={styles.keyRow}>
                  <div className={`${styles.field} ${styles.keyField}`}>
                    <label>Private Key</label>
                    <div className={styles.keyControls}>
                      <input
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value.trim())}
                        placeholder="Enter Private Key"
                        disabled={privateKeyVerified}
                      />
                      <div className={styles.keyButtons}>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small} ${styles.outline}`}
                          onClick={handleRequestPrivateKeyInput}
                          disabled={ privateKeyVerified || (privateKeyGenerated && privateKeyTimer > 0)}
                        >
                          {!privateKeyGenerated ? "Request" : "Request Again"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small} ${styles.outline}`}
                          onClick={handleVerifyPrivateKeyInput}
                          disabled={!privateKeyGenerated || privateKeyVerified}
                        >
                          Verify
                        </button>
                      </div>
                    </div>
                  <div className={styles.noteRow}>
                  {privateKeyMessage && (
                    <small className={`${styles.hint} ${privateKeyVerified ? styles.success : privateKeyMessage.toLowerCase().includes("failed") || privateKeyMessage.toLowerCase().includes("wrong") ? styles.error : ""}`} style={{ marginTop: "-4px" }}>
                      {privateKeyMessage}
                    </small>
                  )}
                  {privateKeyGenerated && privateKeyTimer > 0 && <small className={styles.hint}>Resend in {formatHMS(privateKeyTimer)}</small>}
                </div>
                  </div>
                </div>
              )}

              {/* password */}
              <div className={styles.field}>
                <label>Create Password</label>
                <div className={styles.pwdWrap}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\s/g, "");
                      setPassword(cleaned);
                    }}
                    placeholder="Enter Your Password"
                    aria-describedby="pwdGuide"
                  />
                  <button type="button" className={styles.eye} onClick={() => setShowPassword((s) => !s)} aria-label="Toggle password visibility">
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <div id="pwdGuide" className={styles.pwdChecks}>
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
                  <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value.replace(/\s/g, ""))} placeholder="Enter Your Password" />
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
                      <span className={styles.spinnerInline} aria-hidden="true">
                        <i className="fas fa-hourglass-start"></i>
                      </span>
                      Waiting...
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

        <footer className={styles.uregFooter}>Already have an account? <button
            onClick={() => { try { navigate("/SignIn"); } catch(e){} }}>Sign In</button></footer>
      </div>

      {/* Success modal overlay */}
      {successModal && (
        <div className={styles.successPop} aria-hidden={false}>
          {TICK_SVG}
          <p>Registration Successful<br/>Redirecting To Your Dashboard</p>
        </div>
      )}
    </div>
  );
}