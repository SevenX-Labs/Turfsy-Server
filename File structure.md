# File Tree: Turfsy-server

**Generated:** 4/6/2026, 8:17:10 PM
**Root Path:** `/home/sahil-hode/Documents/Innovox Software Solutions/Turfsy/Turfsy-server`

```
├── 📁 docs
│   ├── 📝 auth_readme.md
│   ├── 📝 customer_booking_api_readme.md
│   ├── 📝 ownerProfile_creation_readme.md
│   ├── 📝 owner_analytics_readme.md
│   ├── 📝 owner_booking_api_readme.md
│   ├── 📝 owner_dashboard_readme.md
│   ├── 📝 owner_setting_readme.md
│   ├── 📝 saved-turfs_readme.md
│   ├── 📝 search-filter-turfs_readme.md
│   ├── 📝 turf_creation_readme.md
│   ├── 📝 userProfile_creation_readme.md
│   ├── 📝 user_gamification_readme.md
│   ├── 📝 user_home_readme.md
│   └── 📝 user_settings_readme.md
├── 📁 prisma
│   ├── 📁 migrations
│   │   ├── 📁 20260406141650_reset_db
│   │   │   └── 📄 migration.sql
│   │   └── ⚙️ migration_lock.toml
│   └── 📄 schema.prisma
├── 📁 src
│   ├── 📁 common
│   │   ├── 📁 decorators
│   │   │   └── 📄 roles.decorator.ts
│   │   ├── 📁 filters
│   │   │   └── 📄 security-exception.filter.ts
│   │   ├── 📁 guards
│   │   │   ├── 📄 cron.guard.ts
│   │   │   └── 📄 roles.guard.ts
│   │   ├── 📁 interceptors
│   │   │   └── 📄 response-sanitizer.interceptor.ts
│   │   └── 📁 services
│   │       ├── 📄 payment-logger.service.ts
│   │       └── 📄 rate-limiter.service.ts
│   ├── 📁 modules
│   │   ├── 📁 auth
│   │   │   ├── 📁 dto
│   │   │   │   ├── 📄 delete-account.dto.ts
│   │   │   │   ├── 📄 login.dto.ts
│   │   │   │   ├── 📄 resend-otp.dto.ts
│   │   │   │   └── 📄 verify-otp.dto.ts
│   │   │   ├── 📁 guards
│   │   │   │   ├── 📄 jwt-auth.guard.ts
│   │   │   │   └── 📄 optional-jwt-auth.guard.ts
│   │   │   ├── 📄 auth.controller.spec.ts
│   │   │   ├── 📄 auth.controller.ts
│   │   │   ├── 📄 auth.module.ts
│   │   │   ├── 📄 auth.service.spec.ts
│   │   │   └── 📄 auth.service.ts
│   │   ├── 📁 booking
│   │   │   ├── 📁 dto
│   │   │   │   └── 📄 booking.dto.ts
│   │   │   ├── 📄 booking.controller.ts
│   │   │   ├── 📄 booking.module.ts
│   │   │   └── 📄 booking.service.ts
│   │   ├── 📁 owner-analytics
│   │   │   ├── 📄 owner-analytics.controller.spec.ts
│   │   │   ├── 📄 owner-analytics.controller.ts
│   │   │   ├── 📄 owner-analytics.module.ts
│   │   │   ├── 📄 owner-analytics.service.spec.ts
│   │   │   └── 📄 owner-analytics.service.ts
│   │   ├── 📁 owner-home
│   │   │   ├── 📄 owner-home.controller.spec.ts
│   │   │   ├── 📄 owner-home.controller.ts
│   │   │   ├── 📄 owner-home.module.ts
│   │   │   ├── 📄 owner-home.service.spec.ts
│   │   │   └── 📄 owner-home.service.ts
│   │   ├── 📁 owner-profile
│   │   │   ├── 📁 dto
│   │   │   │   ├── 📄 create-owner-profile.dto.ts
│   │   │   │   ├── 📄 create-turf.dto.ts
│   │   │   │   ├── 📄 owner-payment-details.dto.ts
│   │   │   │   ├── 📄 update-owner-profile.dto.ts
│   │   │   │   └── 📄 update-turf.dto.ts
│   │   │   ├── 📁 types
│   │   │   │   └── 📄 owner-profile.types.ts
│   │   │   ├── 📄 owner-profile.controller.spec.ts
│   │   │   ├── 📄 owner-profile.controller.ts
│   │   │   ├── 📄 owner-profile.module.ts
│   │   │   ├── 📄 owner-profile.service.spec.ts
│   │   │   └── 📄 owner-profile.service.ts
│   │   ├── 📁 owner-settings
│   │   │   ├── 📁 dto
│   │   │   │   ├── 📄 cancellation-policy.dto.ts
│   │   │   │   ├── 📄 notification-settings.dto.ts
│   │   │   │   ├── 📄 payment-settings.dto.ts
│   │   │   │   ├── 📄 profile-settings.dto.ts
│   │   │   │   └── 📄 turf-settings.dto.ts
│   │   │   ├── 📄 owner-settings.controller.spec.ts
│   │   │   ├── 📄 owner-settings.controller.ts
│   │   │   ├── 📄 owner-settings.module.ts
│   │   │   ├── 📄 owner-settings.service.spec.ts
│   │   │   └── 📄 owner-settings.service.ts
│   │   ├── 📁 saved-turfs
│   │   │   ├── 📄 saved-turfs.controller.ts
│   │   │   ├── 📄 saved-turfs.module.ts
│   │   │   └── 📄 saved-turfs.service.ts
│   │   ├── 📁 turfs
│   │   │   ├── 📄 turfs.controller.spec.ts
│   │   │   ├── 📄 turfs.controller.ts
│   │   │   ├── 📄 turfs.module.ts
│   │   │   ├── 📄 turfs.service.spec.ts
│   │   │   └── 📄 turfs.service.ts
│   │   ├── 📁 upload
│   │   │   ├── 📄 upload.controller.ts
│   │   │   ├── 📄 upload.module.ts
│   │   │   └── 📄 upload.service.ts
│   │   ├── 📁 user-gamification
│   │   │   ├── 📄 user-gamification.controller.spec.ts
│   │   │   ├── 📄 user-gamification.controller.ts
│   │   │   ├── 📄 user-gamification.module.ts
│   │   │   ├── 📄 user-gamification.service.spec.ts
│   │   │   └── 📄 user-gamification.service.ts
│   │   ├── 📁 user-home
│   │   │   ├── 📁 dto
│   │   │   │   ├── 📄 turf-card.dto.ts
│   │   │   │   ├── 📄 user-home-query.dto.ts
│   │   │   │   ├── 📄 user-home-response.dto.ts
│   │   │   │   ├── 📄 user-home-section-response.dto.ts
│   │   │   │   └── 📄 user-home-section.dto.ts
│   │   │   ├── 📁 types
│   │   │   │   └── 📄 home-section.enum.ts
│   │   │   ├── 📄 user-home.controller.ts
│   │   │   ├── 📄 user-home.module.ts
│   │   │   └── 📄 user-home.service.ts
│   │   ├── 📁 user-profile
│   │   │   ├── 📁 dto
│   │   │   │   ├── 📄 create-profile.dto.ts
│   │   │   │   ├── 📄 payment-details.dto.ts
│   │   │   │   └── 📄 update-profile.dto.ts
│   │   │   ├── 📄 user-profile.controller.spec.ts
│   │   │   ├── 📄 user-profile.controller.ts
│   │   │   ├── 📄 user-profile.module.ts
│   │   │   ├── 📄 user-profile.service.spec.ts
│   │   │   └── 📄 user-profile.service.ts
│   │   └── 📁 user-settings
│   │       ├── 📁 dto
│   │       │   ├── 📄 change-password.dto.ts
│   │       │   ├── 📄 change-phone.dto.ts
│   │       │   ├── 📄 notification-settings.dto.ts
│   │       │   ├── 📄 payment-settings.dto.ts
│   │       │   └── 📄 preferences.dto.ts
│   │       ├── 📄 user-settings.controller.spec.ts
│   │       ├── 📄 user-settings.controller.ts
│   │       ├── 📄 user-settings.module.ts
│   │       ├── 📄 user-settings.service.spec.ts
│   │       └── 📄 user-settings.service.ts
│   ├── 📁 prisma
│   │   ├── 📄 prisma.module.ts
│   │   └── 📄 prisma.service.ts
│   ├── 📄 app.controller.spec.ts
│   ├── 📄 app.controller.ts
│   ├── 📄 app.module.ts
│   ├── 📄 app.service.ts
│   └── 📄 main.ts
├── 📁 test
│   ├── 📄 app.e2e-spec.ts
│   └── ⚙️ jest-e2e.json
├── 📁 uploads
│   └── 📁 avatars
│       └── 🖼️ f95dfbd1-8228-46d0-82ca-798c609a7aa5-1774359070306-521019376.jpg
├── ⚙️ .gitignore
├── ⚙️ .prettierrc
├── 📝 README.md
├── 📄 eslint.config.mjs
├── ⚙️ nest-cli.json
├── ⚙️ package-lock.json
├── ⚙️ package.json
├── 📄 prisma.config.ts
└── ⚙️ tsconfig.json
```

---
*Generated by FileTree Pro Extension*