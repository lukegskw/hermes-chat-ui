import type { ChangeEventHandler, ReactNode } from "react";
import { ChevronDown } from "../Icons";
import styles from "./SelectField.module.scss";

export type SelectFieldOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectFieldGroup = {
  label: string;
  options: SelectFieldOption[];
};

export type SelectFieldItem = SelectFieldOption | SelectFieldGroup;

type SelectFieldProps = {
  label: ReactNode;
  value: string;
  options: SelectFieldItem[];
  onChange: ChangeEventHandler<HTMLSelectElement>;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
};

export const SelectField = ({
  label,
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  className = "",
  compact = false,
}: SelectFieldProps) => (
  <label
    className={`${styles.field} ${compact ? styles.compact : ""} ${className}`}
  >
    <span className={styles.label}>{label}</span>
    <span className={styles.selectWrapper}>
      <select
        value={value}
        onChange={onChange}
        className={styles.select}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        {options.map((item, index) =>
          "options" in item ? (
            <optgroup key={`${item.label}-${index}`} label={item.label}>
              {item.options.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option
              key={item.value}
              value={item.value}
              disabled={item.disabled}
            >
              {item.label}
            </option>
          ),
        )}
      </select>
      <ChevronDown size={13} className={styles.chevron} aria-hidden="true" />
    </span>
  </label>
);
