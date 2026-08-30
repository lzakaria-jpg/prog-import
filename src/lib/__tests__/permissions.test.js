import { describe, it, expect } from "vitest";
import { ROLES, can, canManageUsers, isOwner, canModifyUser, clampGrantablePermissions } from "../permissions.js";

const owner = { email: "owner@x.com", role: ROLES.OWNER, permissions: {}, active: true };
const manager = { email: "mgr@x.com", role: ROLES.FULL_USER_MANAGER, permissions: { "tool.chat": true }, active: true };
const user = { email: "u@x.com", role: ROLES.USER, permissions: { "chat.send": true }, active: true };
const disabledUser = { email: "d@x.com", role: ROLES.USER, permissions: { "chat.send": true }, active: false };

describe("can — the owner always has every permission, regardless of stored grants", () => {
  it("owner has any permission key even with an empty permissions object", () => {
    expect(can(owner, "tool.journal")).toBe(true);
    expect(can(owner, "chat.clear_chat")).toBe(true);
    expect(can(owner, "anything.not.real")).toBe(true);
  });

  it("a regular user only has explicitly granted keys", () => {
    expect(can(user, "chat.send")).toBe(true);
    expect(can(user, "chat.delete_others")).toBe(false);
    expect(can(user, "tool.journal")).toBe(false);
  });

  it("a full user manager is not automatically granted tool access", () => {
    expect(can(manager, "tool.journal")).toBe(false);
    expect(can(manager, "tool.chat")).toBe(true); // granted explicitly above
  });

  it("a disabled user has no permission at all, even ones stored as true", () => {
    expect(can(disabledUser, "chat.send")).toBe(false);
  });

  it("null/undefined user has no permission", () => {
    expect(can(null, "chat.send")).toBe(false);
    expect(can(undefined, "chat.send")).toBe(false);
  });
});

describe("canManageUsers / isOwner", () => {
  it("owner and full_user_manager can manage users; a plain user cannot", () => {
    expect(canManageUsers(owner)).toBe(true);
    expect(canManageUsers(manager)).toBe(true);
    expect(canManageUsers(user)).toBe(false);
  });

  it("a disabled full_user_manager loses management rights", () => {
    expect(canManageUsers({ ...manager, active: false })).toBe(false);
  });

  it("isOwner is true only for the owner role", () => {
    expect(isOwner(owner)).toBe(true);
    expect(isOwner(manager)).toBe(false);
  });
});

describe("canModifyUser — the absolute owner-protection rule", () => {
  it("no one — not even another full_user_manager or the owner themself — can modify the owner", () => {
    expect(canModifyUser(manager, owner)).toBe(false);
    expect(canModifyUser(owner, owner)).toBe(false);
  });

  it("a full_user_manager can modify a plain user", () => {
    expect(canModifyUser(manager, user)).toBe(true);
  });

  it("a plain user cannot modify anyone, even another plain user", () => {
    expect(canModifyUser(user, { ...user, email: "other@x.com" })).toBe(false);
  });

  it("the owner can modify a plain user or a full_user_manager", () => {
    expect(canModifyUser(owner, user)).toBe(true);
    expect(canModifyUser(owner, manager)).toBe(true);
  });

  it("no one — not even a full_user_manager themself — can self-target via this path", () => {
    expect(canModifyUser(manager, manager)).toBe(false);
    expect(canModifyUser(user, user)).toBe(false);
  });
});

describe("clampGrantablePermissions — cannot grant what you don't have yourself", () => {
  it("a full_user_manager cannot grant a tool permission they lack", () => {
    const result = clampGrantablePermissions(manager, { "tool.journal": true, "tool.chat": true });
    expect(result["tool.journal"]).toBeUndefined();
    expect(result["tool.chat"]).toBe(true); // manager already has this one
  });

  it("the owner can grant anything, unclamped", () => {
    const result = clampGrantablePermissions(owner, { "tool.journal": true, "chat.clear_chat": true });
    expect(result).toEqual({ "tool.journal": true, "chat.clear_chat": true });
  });

  it("revoking a permission (false) is never blocked, even one the actor lacks", () => {
    const result = clampGrantablePermissions(manager, { "tool.journal": false });
    expect(result["tool.journal"]).toBe(false);
  });
});
