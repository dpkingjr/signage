"use client";

import type { Profile } from "@/lib/auth";

export const BLANK_PROFILE: Profile = { firstName: "", lastName: "", email: "" };

type Props = { value: Profile; onChange: (next: Profile) => void; grow?: boolean };

export default function ProfileFields({ value, onChange, grow }: Props) {
  const className = grow ? "field grow" : "field";
  return (
    <>
      <label className={className}>
        <span>First name</span>
        <input
          value={value.firstName}
          onChange={(e) => onChange({ ...value, firstName: e.target.value })}
          maxLength={80}
          autoComplete="off"
        />
      </label>
      <label className={className}>
        <span>Last name</span>
        <input
          value={value.lastName}
          onChange={(e) => onChange({ ...value, lastName: e.target.value })}
          maxLength={80}
          autoComplete="off"
        />
      </label>
      <label className={className}>
        <span>Email address</span>
        <input
          type="email"
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
          maxLength={254}
          autoComplete="off"
        />
      </label>
    </>
  );
}
