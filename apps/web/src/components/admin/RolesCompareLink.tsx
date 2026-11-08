/** Roles list → link to the who-can-do-what table (E-039). */
export function RolesCompareLink() {
  return (
    <div className="ed-roles-link">
      <p>
        هر نقش مجموعه‌ای از دسترسی‌ها، قانون‌های امنیتی و تنظیمات ظاهری است. برای دیدن اینکه هر نقش چه کاری می‌تواند بکند، نقش‌ها را کنار هم ببینید.
      </p>
      <a className="c-btn" href="/admin/roles-compare">
        مقایسهٔ نقش‌ها
      </a>
    </div>
  )
}
