// src/pages/Authentication/components/UserReg.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import styles from "./UserReg.module.css";

// ---------------- CONFIG ----------------
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const OTP_TIMEOUT_SECONDS = 10 * 60; // 10 minutes
const PRIVATE_KEY_TIMEOUT_SECONDS = 10 * 60; // 10 minutes
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

  // OTP flow (Supabase-backed)
  const [otp, setOtp] = useState("");
  const [otpGenerated, setOtpGenerated] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const otpIntervalRef = useRef(null);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpRequestsCount, setOtpRequestsCount] = useState(0);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [sendOtpLabel, setSendOtpLabel] = useState("Send OTP");

  // ---------- Private Key state ----------
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

  // helper: format seconds
  function formatHMS(s) {
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  // ---------- VALIDATORS ----------
  function validateEmail(em) {
    if (!em) return false;
    const cleaned = String(em)
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
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

  // ========== PRIVATE KEY REQUEST (Admin) ==========
  async function handleRequestPrivateKeyInput() {
    setPrivateKeyMessage("");
    if (
      !(
        (email && validateEmail(email)) ||
        (contactNumber && validateContact(contactNumber))
      )
    ) {
      setPrivateKeyMessage(
        "Enter valid email & contact before requesting a private key"
      );
      return;
    }

    try {
      setPrivateKeyMessage("Requesting Private Key...");
      // Try first: backend endpoint (preferred)
      if (API_BASE_URL) {
        const res = await fetch(`${API_BASE_URL}/auth/private-key/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email?.trim()?.toLowerCase() || null,
            contact: contactNumber?.trim() || null,
            purpose: "signup",
          }),
        });

        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = j.error || j.message || "Private key generation failed";
          throw new Error(msg);
        }

        // server responds { ok:true, admin_notified: boolean, admin_error?: ... }
        setPrivateKeyGenerated(true);
        setPrivateKeyVerified(false);
        if (j.admin_notified) {
          setPrivateKeyMessage("Request Sent! Contact Super-Admin For The Key");
        } else {
          setPrivateKeyMessage(
            j.admin_error
              ? `Stored! Admin notification not completed: ${j.admin_error}`
              : "Stored! Admin will be notified by server/edge function"
          );
        }

        // start visual-only timer
        setPrivateKeyTimer(PRIVATE_KEY_TIMEOUT_SECONDS);
        if (privateKeyIntervalRef.current)
          clearInterval(privateKeyIntervalRef.current);
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

        return;
      }

      // Fallback: call Supabase Edge Function (public client can call it if it's exposed)
      if (typeof supabase.functions?.invoke === "function") {
        const payload = {
          email: email?.trim()?.toLowerCase() || null,
          contact: contactNumber?.trim() || null,
          purpose: "signup",
          expiresMinutes: Math.floor(PRIVATE_KEY_TIMEOUT_SECONDS / 60),
        };

        const fnRes = await supabase.functions.invoke("private-key", {
          body: payload,
        });

        // supabase.functions.invoke returns either { data, error } or a Response-like object depending on SDK version.
        // Normalize:
        const fnError =
          fnRes?.error ||
          (fnRes?.status && fnRes.status >= 400
            ? new Error("Edge function error")
            : null);
        const fnData = fnRes?.data ?? fnRes;

        if (fnError) {
          throw new Error(fnError.message || "Edge function returned an error");
        }

        // Expected fnData: { ok:true, admin_notified: boolean, ... } OR { ok:true, admin_notified:false, message: ... }
        setPrivateKeyGenerated(true);
        setPrivateKeyVerified(false);
        if (fnData?.admin_notified) {
          setPrivateKeyMessage("Request Sent! Contact Super-Admin For The Key");
        } else {
          setPrivateKeyMessage(fnData?.message || "Hashed request stored!");
        }

        setPrivateKeyTimer(PRIVATE_KEY_TIMEOUT_SECONDS);
        if (privateKeyIntervalRef.current)
          clearInterval(privateKeyIntervalRef.current);
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

        return;
      }

      // If we reach here: no API_BASE_URL and no functions.invoke available
      setPrivateKeyMessage(
        "No server endpoint configured! Please contact the administrator"
      );
    } catch (err) {
      console.error("private key gen error", err);
      setPrivateKeyMessage(err?.message || "Failed to generate private key");
      setPrivateKeyGenerated(false);
    }
  }

  async function handleVerifyPrivateKeyInput() {
    setPrivateKeyMessage("");
    if (!privateKeyGenerated) {
      setPrivateKeyMessage("Request a private key first before verifying");
      return;
    }
    if (!privateKey || privateKey.trim().length < 3) {
      setPrivateKeyMessage("Enter the private key to verify");
      return;
    }

    try {
      // Verification must happen on the server (service role) because the DB stores only hashes
      if (!API_BASE_URL) {
        setPrivateKeyMessage(
          "Verification requires server endpoint. Please contact admin."
        );
        return;
      }

      const res = await fetch(`${API_BASE_URL}/auth/private-key/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email?.trim()?.toLowerCase() || null,
          contact: contactNumber?.trim() || null,
          privateKey: privateKey.trim(),
          purpose: "signup",
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(
          j.error || j.message || j || "Private key verification failed"
        );

      setPrivateKeyVerified(Boolean(j.verified));
      setPrivateKeyMessage(
        j.verified
          ? "Private key verified successfully!"
          : "Verification failed"
      );
      if (j.verified && privateKeyIntervalRef.current) {
        clearInterval(privateKeyIntervalRef.current);
        privateKeyIntervalRef.current = null;
      }
      if (j.verified) setPrivateKeyTimer(0);
    } catch (err) {
      console.error("private key verify error", err);
      setPrivateKeyMessage(err?.message || "Failed to verify private key");
      setPrivateKeyVerified(false);
    }
  }

  // OTP generation & verify (Supabase-backed: OTP token via email template with {{ .Token }})
  async function handleGenerateOtp() {
    setOtpMessage("");
    if (!email || !validateEmail(email)) {
      setOtpMessage("Enter valid email to receive the OTP");
      return;
    }

    try {
      setOtpMessage("Sending OTP...");

      // call signInWithOtp to send the OTP. Supabase email template should include {{ .Token }}
      const attempt = await supabase.auth.signInWithOtp({
        email: String(email).trim().toLowerCase(),
      });

      // Normalize errors across SDK versions:
      const error =
        attempt?.error ||
        attempt?.data?.error ||
        (attempt?.error && attempt.error.message);
      if (error) throw error;

      setOtpGenerated(true);
      setOtpVerified(false);
      setOtpMessage("OTP Sent! Check Your Inbox/Spam Folder");
      setOtpRequestsCount((c) => c + 1);

      // visual-only countdown
      setOtpTimer(OTP_TIMEOUT_SECONDS);
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
      console.error("otp gen error", err);
      setOtpMessage(err?.message || String(err) || "Failed To Send OTP!");
    }
  }

  async function handleVerifyOtp() {
    setOtpMessage("");
    if (!otpGenerated) {
      setOtpMessage("Request OTP first");
      return;
    }
    if (!otp || otp.trim().length < 3) {
      setOtpMessage("Enter the OTP from your email");
      return;
    }

    setVerifyingOtp(true);
    setOtpMessage("Verifying OTP...");

    try {
      // Use Supabase client verifyOtp method (verifies numeric OTP)
      const result = await supabase.auth.verifyOtp({
        email: String(email).trim().toLowerCase(),
        token: String(otp).trim(),
        type: "email",
      });

      const err = result?.error || result?.data?.error;
      if (err) throw err;

      // On success, result.data may contain session/user depending on your settings
      setOtpVerified(true);
      setOtpMessage("OTP Verified Successfully!");
      // clear timer
      if (otpIntervalRef.current) {
        clearInterval(otpIntervalRef.current);
        otpIntervalRef.current = null;
      }
      setOtpTimer(0);
    } catch (err) {
      console.error("verify otp err", err);
      setOtpMessage(
        err?.message ||
          "OTP Verification Failed! Ensure you typed the Correct OTP"
      );
      setOtpVerified(false);
    } finally {
      setVerifyingOtp(false);
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
      // Use Supabase signUp (email/password)
      if (!email) {
        throw new Error(
          "Registration requires an email address! Please enter your email"
        );
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
            access_key: isStudent
              ? accessKey && accessKey.trim().length
                ? accessKey.trim()
                : null
              : null,
          },
        },
      };

      const { data: signData, error: signErr } = await supabase.auth.signUp(
        signPayload
      );
      if (signErr) throw signErr;

      const userId = signData?.user?.id ?? null;
      try {
        if (userId) {
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
          if (profileErr) console.warn("profiles upsert failed:", profileErr);
        } else {
          console.info(
            "User id not returned immediately! Ensure server-side profile creation on signup confirmation"
          );
        }
      } catch (err) {
        console.warn("profile creation error", err);
      }

      // Show success
      setSuccessModal(true);
      setTimeout(async () => {
        setSuccessModal(false);
        try {
          if (signData?.user) {
            navigate(isAdmin ? "/Admin/Dashboard" : "/User/Dashboard", {
              replace: true,
            });
          } else {
            navigate("/", { replace: true });
          }
        } catch (navErr) {
          console.warn("navigate after signup failed", navErr);
          navigate("/", { replace: true });
        }
      }, 1300);
    } catch (err) {
      console.error("register error", err);
      setFormError(err?.message || "Registration Failed! Try Again...");
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
      if (debounceEmailRef.current) clearTimeout(debounceEmailRef.current);
      if (debounceContactRef.current) clearTimeout(debounceContactRef.current);
      if (debounceNameRef.current) clearTimeout(debounceNameRef.current);
    };
  }, []);

  // ---------- UI render ----------
  const isStudent = userType === "Student";
  const isAdmin = userType === "Admin";
  const signUpEnabled = (() => {
    if (!isStudent && !isAdmin) return false;
    if (isStudent) {
      if (!fullName.trim() || !stream.trim() || !yearOfStudy.trim())
        return false;
      if (!allPasswordChecksPass()) return false;
      if (password !== confirmPassword) return false;
      if (!accessKey || accessKey.trim().length < 1) return false;
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

        <form
          className={styles.uregForm}
          onSubmit={handleCreateAccount}
          noValidate
        >
          <div className={styles.field}>
            <label>User Type</label>
            <select
              value={userType}
              onChange={(e) => {
                setUserType(e.target.value);
                // Reset OTP & related flags on switching
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
                setAccessAutoFoundFor(null);
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
                      <input
                        value={stream}
                        onChange={(e) => setStream(e.target.value)}
                        placeholder="Enter Your Stream"
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label>Academic Year</label>
                      <input
                        value={yearOfStudy}
                        onChange={(e) => setYearOfStudy(e.target.value)}
                        placeholder="Enter Your Year of Study"
                        required
                      />
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
                  <div
                    className={styles.statusRow}
                    style={{ marginTop: "4px", marginLeft: "6px" }}
                  >
                    {contactNumber && !validateContact(contactNumber) && (
                      <span className={`${styles.note} ${styles.error}`}>
                        Phone must be exactly 10 digits
                      </span>
                    )}
                    {userExistsContactStatus === "checking" && (
                      <span className={styles.note}>
                        Checking availability...
                      </span>
                    )}
                    {userExistsContactStatus === true &&
                      validateContact(contactNumber) && (
                        <span className={`${styles.note} ${styles.error}`}>
                          Contact already exists! Use different contact or try
                          signing in
                        </span>
                      )}
                    {userExistsContactStatus === false &&
                      validateContact(contactNumber) && (
                        <span className={`${styles.note} ${styles.success}`}>
                          Contact not registered yet
                        </span>
                      )}
                  </div>
                </div>

                <div className={styles.field}>
                  <label>Email ID</label>
                  <input
                    value={email}
                    onChange={(e) =>
                      setEmail(
                        e.target.value.replace(/[\u200B-\u200D\uFEFF]/g, "")
                      )
                    }
                    onBlur={() => setEmail((v) => String(v || "").trim())}
                    placeholder="Enter Your Email ID"
                  />
                  <div
                    className={styles.statusRow}
                    style={{ marginTop: "4px", marginLeft: "6px" }}
                  >
                    {email && !validateEmail(email) && (
                      <span className={`${styles.note} ${styles.error}`}>
                        Invalid email format
                      </span>
                    )}
                    {userExistsEmailStatus === "checking" && (
                      <span className={styles.note}>
                        Checking availability...
                      </span>
                    )}
                    {userExistsEmailStatus === true && validateEmail(email) && (
                      <span className={`${styles.note} ${styles.error}`}>
                        Email already exists! Use different email or try signing
                        in
                      </span>
                    )}
                    {userExistsEmailStatus === false &&
                      validateEmail(email) && (
                        <span className={`${styles.note} ${styles.success}`}>
                          Email not registered yet
                        </span>
                      )}
                  </div>
                </div>
              </div>

              {/* OTP area (Supabase email-based OTP using {{ .Token }} in template) */}
              <div className={styles.otpRow}>
                <div className={`${styles.field} ${styles.otpField}`}>
                  <label>OTP Verification</label>
                  <div className={styles.otpControls}>
                    <input
                      value={otp}
                      onChange={(e) =>
                        setOtp(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="Enter The OTP"
                      readOnly={otpVerified}
                      disabled={otpVerified}
                    />
                    <div className={styles.otpButtons}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.small} ${styles.outline}`}
                        onClick={handleGenerateOtp}
                        disabled={otpVerified || (otpGenerated && otpTimer > 0)}
                      >
                        {!otpGenerated ? sendOtpLabel : "Resend OTP"}
                      </button>

                      <button
                        type="button"
                        className={`${styles.btn} ${styles.small} ${styles.outline}`}
                        onClick={handleVerifyOtp}
                        disabled={!otpGenerated || otpVerified || verifyingOtp}
                      >
                        Verify
                      </button>
                    </div>
                  </div>
                  <div className={styles.noteRow}>
                    {otpMessage && (
                      <small
                        className={`${styles.hint} ${
                          otpVerified
                            ? styles.success
                            : otpMessage.toLowerCase().includes("failed") ||
                              otpMessage.toLowerCase().includes("wrong")
                            ? styles.error
                            : ""
                        }`}
                        style={{ marginTop: "-4px" }}
                      >
                        {otpMessage}
                      </small>
                    )}
                    {otpGenerated && otpTimer > 0 && (
                      <small className={styles.hint}>
                        Resend in {formatHMS(otpTimer)}
                      </small>
                    )}
                  </div>
                </div>
              </div>

              {/* access key (student) */}
              {isStudent && (
                <div className={styles.field}>
                  <label>Access Key</label>
                  <input
                    value={accessKey}
                    onChange={(e) => {
                      if (accessKeyDisabled) return;
                      setAccessKey(
                        e.target.value.replace(/\D/g, "").slice(0, 4)
                      );
                    }}
                    placeholder="E.g. NIT/2023/XXXX"
                    disabled={accessKeyDisabled}
                  />
                  {accessAutoFoundFor && (
                    <small className={styles.hint} style={{ color: "#2ecc71" }}>
                      System Auto-filled, No Edit Needed
                    </small>
                  )}
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
                        placeholder="Enter The Private Key"
                        disabled={privateKeyVerified}
                      />
                      <div className={styles.keyButtons}>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.small} ${styles.outline}`}
                          onClick={handleRequestPrivateKeyInput}
                          disabled={
                            privateKeyVerified ||
                            (privateKeyGenerated && privateKeyTimer > 0)
                          }
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
                        <small
                          className={`${styles.hint} ${
                            privateKeyVerified
                              ? styles.success
                              : privateKeyMessage
                                  .toLowerCase()
                                  .includes("failed") ||
                                privateKeyMessage
                                  .toLowerCase()
                                  .includes("wrong")
                              ? styles.error
                              : ""
                          }`}
                          style={{ marginTop: "-4px" }}
                        >
                          {privateKeyMessage}
                        </small>
                      )}
                      {privateKeyGenerated && privateKeyTimer > 0 && (
                        <small className={styles.hint}>
                          Resend in {formatHMS(privateKeyTimer)}
                        </small>
                      )}
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
                  <button
                    type="button"
                    className={styles.eye}
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <div
                  id="pwdGuide"
                  className={styles.pwdChecks}
                  style={{ display: password.length > 0 ? "grid" : "none" }}
                >
                  <div
                    className={`${styles.check} ${
                      passwordChecks.length ? styles.ok : ""
                    }`}
                  >
                    Minimum 12 Characters
                  </div>
                  <div
                    className={`${styles.check} ${
                      passwordChecks.upper ? styles.ok : ""
                    }`}
                  >
                    Contains One Uppercase
                  </div>
                  <div
                    className={`${styles.check} ${
                      passwordChecks.lower ? styles.ok : ""
                    }`}
                  >
                    Contains One Lowercase
                  </div>
                  <div
                    className={`${styles.check} ${
                      passwordChecks.digit ? styles.ok : ""
                    }`}
                  >
                    Contains One Digit
                  </div>
                  <div
                    className={`${styles.check} ${
                      passwordChecks.special ? styles.ok : ""
                    }`}
                  >
                    Contains One Special Character
                  </div>
                  <div
                    className={`${styles.check} ${
                      passwordChecks.noName ? styles.ok : ""
                    }`}
                  >
                    Does Not Include Your Name
                  </div>
                </div>
              </div>

              <div className={styles.field}>
                <label>Confirm Password</label>
                <div className={styles.pwdWrap}>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(e.target.value.replace(/\s/g, ""))
                    }
                    placeholder="Re-Enter Your Password"
                  />
                  <button
                    type="button"
                    className={styles.eye}
                    onClick={() => setShowConfirmPassword((s) => !s)}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== password && (
                  <small className={`${styles.hint} ${styles.error}`}>
                    Passwords do not match
                  </small>
                )}
                {confirmPassword && confirmPassword === password && (
                  <small className={`${styles.hint} ${styles.success}`}>
                    Passwords matched
                  </small>
                )}
              </div>

              {formError && <div className={styles.formError}>{formError}</div>}

              <div className={styles.actions}>
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.primary}`}
                  disabled={!signUpEnabled || isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className={styles.spinnerInline} aria-hidden="true">
                        <i className="fas fa-hourglass-start"></i>
                      </span>
                      Processing...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.cancel}`}
                  onClick={() => navigate("/")}
                >
                  Cancel Process
                </button>
              </div>
            </div>
          )}
        </form>

        <footer className={styles.uregFooter}>
          Already have an account?{" "}
          <button
            onClick={() => {
              try {
                navigate("/SignIn");
              } catch (e) {}
            }}
          >
            Sign In
          </button>
        </footer>
      </div>

      {/* Success modal overlay */}
      {successModal && (
        <div className={styles.successPop} aria-hidden={false}>
          {TICK_SVG}
          <p>
            Registration Successful
            <br />
            Redirecting To Your Dashboard
          </p>
        </div>
      )}
    </div>
  );
}