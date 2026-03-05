"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface LinkedAccount {
  provider: string;
  providerAccountId: string;
}

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  console.log("Session data:", session);
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountMessage, setAccountMessage] = useState("");
  const [formData, setFormData] = useState({
    name: session?.user?.name || "",
    email: session?.user?.email || "",
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [message, setMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "unauthenticated") return null;

  // Fetch linked accounts
  useEffect(() => {
    const fetchLinkedAccounts = async () => {
      try {
        const response = await fetch(
          `/api/v1/users/${session?.user?.id}/accounts`,
        );
        if (response.ok) {
          const data = await response.json();
          setLinkedAccounts(data.accounts || []);
        }
      } catch (error) {
        console.error("Error fetching linked accounts:", error);
      } finally {
        setLoadingAccounts(false);
      }
    };

    if (session?.user?.id) {
      fetchLinkedAccounts();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user) {
      setFormData({
        name: session.user.name ?? "",
        email: session.user.email ?? "",
      });
    }
  }, [session?.user?.name, session?.user?.email]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePasswordInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/v1/users/${session?.user?.id}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formData.name }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update profile");
      }

      const updatedUser = await res.json();

      // 1) ya se guardó en DB
      // 2) refresca token/session desde callbacks
      await update({ user: { name: updatedUser.name } }); // ✅ una sola vez
      const s = await fetch("/api/auth/session").then((r) => r.json());
      console.log("session after update:", s);

      setMessage("Profile updated successfully!");
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to update profile. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordMessage("");

    // Validation
    if (
      !passwordData.currentPassword ||
      !passwordData.newPassword ||
      !passwordData.confirmPassword
    ) {
      setPasswordMessage("All fields are required");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage("New passwords do not match");
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordMessage("New password must be at least 8 characters long");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/v1/users/${session?.user?.id}/password`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currentPassword: passwordData.currentPassword,
            newPassword: passwordData.newPassword,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to change password");
      }

      setPasswordMessage("Password changed successfully!");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordMessage("");
      }, 2000);
    } catch (error) {
      console.error("Error changing password:", error);
      setPasswordMessage(
        error instanceof Error
          ? error.message
          : "Failed to change password. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: session?.user?.name || "",
      email: session?.user?.email || "",
    });
    setIsEditing(false);
    setMessage("");
  };

  const handleLinkGoogle = () => {
    setAccountMessage("");
    // Redirect to the account linking page
    const currentPath = `/users/${session?.user?.id}`;
    router.push(
      `/auth/link-account?provider=google&callbackUrl=${encodeURIComponent(currentPath)}`,
    );
  };

  const handleUnlinkGoogle = async () => {
    if (
      !confirm(
        "Are you sure you want to unlink your Google account? You will still be able to log in with your email and password.",
      )
    ) {
      return;
    }

    setAccountMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/v1/users/${session?.user?.id}/accounts/google`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to unlink Google account");
      }

      setAccountMessage("Google account unlinked successfully!");
      // Refresh linked accounts
      const accountsResponse = await fetch(
        `/api/v1/users/${session?.user?.id}/accounts`,
      );
      if (accountsResponse.ok) {
        const data = await accountsResponse.json();
        setLinkedAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error("Error unlinking Google account:", error);
      setAccountMessage(
        error instanceof Error
          ? error.message
          : "Failed to unlink Google account. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Profile Settings
            </h1>
            <p className="text-gray-600 mt-1">
              Manage your account information and preferences
            </p>
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Profile Information */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          Personal Information
        </h2>

        <div className="space-y-6">
          {/* Profile Picture */}
          <div className="flex items-center space-x-6">
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-2xl font-bold">
                {session?.user?.name?.charAt(0).toUpperCase() || "U"}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                {session?.user?.name}
              </h3>
              <p className="text-gray-600">{session?.user?.email}</p>
              {isEditing && (
                <button className="mt-2 text-blue-600 hover:text-blue-800 text-sm">
                  Change profile picture
                </button>
              )}
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your full name"
                />
              ) : (
                <p className="text-gray-900 py-2">
                  {session?.user?.name || "Not provided"}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <p className="text-gray-900 py-2">{session?.user?.email}</p>
              <p className="text-sm text-gray-500">Email cannot be changed</p>
            </div>
          </div>

          {/* Roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Roles
            </label>
            <div className="flex flex-wrap gap-2">
              {session?.user?.roles?.map((role: string) => (
                <span
                  key={role}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                >
                  {role}
                </span>
              )) || <span className="text-gray-500">No roles assigned</span>}
            </div>
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Permissions
            </label>
            <div className="flex flex-wrap gap-2">
              {session?.user?.permissions?.map((permission: string) => (
                <span
                  key={permission}
                  className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
                >
                  {permission}
                </span>
              )) || (
                <span className="text-gray-500">No permissions assigned</span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {isEditing && (
          <div className="flex justify-end space-x-4 mt-6 pt-6 border-t">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}

        {/* Message */}
        {message && (
          <div
            className={`mt-4 p-4 rounded-lg ${
              message.includes("successfully")
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            {message}
          </div>
        )}
      </div>

      {/* Account Information */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          Account Information
        </h2>

        <div className="space-y-4">
          <div className="flex justify-between items-center py-3 border-b border-gray-200">
            <span className="text-gray-600">Account Status</span>
            <span className="text-green-600 font-medium">Active</span>
          </div>

          <div className="flex justify-between items-center py-3 border-b border-gray-200">
            <span className="text-gray-600">Member Since</span>
            <span className="text-gray-900">
              {session?.user?.createdAt
                ? new Date(session.user.createdAt).toLocaleDateString()
                : "Unknown"}
            </span>
          </div>

          <div className="flex justify-between items-center py-3 border-b border-gray-200">
            <span className="text-gray-600">Last Login</span>
            <span className="text-gray-900">
              {new Date().toLocaleDateString()}{" "}
              {/* This would come from session data */}
            </span>
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Security</h2>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-gray-900 font-medium">Password</h3>
              <p className="text-gray-600 text-sm">Last changed 30 days ago</p>
            </div>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Change Password
            </button>
          </div>

          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-gray-900 font-medium">
                Two-Factor Authentication
              </h3>
              <p className="text-gray-600 text-sm">
                Add an extra layer of security
              </p>
            </div>
            <button className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Enable 2FA
            </button>
          </div>

          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-gray-900 font-medium">Google Account</h3>
              <p className="text-gray-600 text-sm">
                {linkedAccounts.some((acc) => acc.provider === "google")
                  ? "Your Google account is linked"
                  : "Link your Google account for easier login"}
              </p>
            </div>
            {linkedAccounts.some((acc) => acc.provider === "google") ? (
              <button
                onClick={handleUnlinkGoogle}
                disabled={isLoading}
                className="px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Unlink Google
              </button>
            ) : (
              <button
                onClick={handleLinkGoogle}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isLoading ? "Linking..." : "Link Google"}
              </button>
            )}
          </div>

          {accountMessage && (
            <div
              className={`p-4 rounded-lg ${
                accountMessage.includes("successfully")
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {accountMessage}
            </div>
          )}
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Change Password
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter current password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter new password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Confirm new password"
                  />
                </div>
              </div>

              {/* Password Message */}
              {passwordMessage && (
                <div
                  className={`mt-4 p-3 rounded-lg text-sm ${
                    passwordMessage.includes("successfully")
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  {passwordMessage}
                </div>
              )}

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordData({
                      currentPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                    setPasswordMessage("");
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handlePasswordChange}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  disabled={isLoading}
                >
                  {isLoading ? "Changing..." : "Change Password"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
