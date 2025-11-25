# Chammy Florals Mobile App - Updates Guide

## How App Updates Work

Your app uses **EAS Updates** which allows you to push updates to users WITHOUT going through the App Store/Play Store review process.

### What Can Be Updated Over-The-Air (OTA)?
✅ **JavaScript/TypeScript code changes**
✅ **UI/UX updates**
✅ **API endpoint changes**
✅ **Bug fixes**
✅ **New features (JS-based)**

### What CANNOT Be Updated OTA?
❌ **Native code changes** (requires new build)
❌ **App permissions changes**
❌ **New native dependencies**
❌ **App icon or splash screen**

## Publishing Updates

### 1. Make Your Changes
Edit your code as needed (screens, components, API calls, etc.)

### 2. Publish the Update
```bash
cd mobile-app

# For production updates
eas update --branch production --message "Fixed product fetching issue"

# For preview/testing
eas update --branch preview --message "Testing new feature"
```

### 3. Users Get Updates Automatically
- When users open the app, it checks for updates
- Updates download in the background
- On next app restart, the update is applied
- **Users don't need to do anything!**

## Current Configuration

**Project ID:** ad439029-6105-4fcd-957e-273591986bb7
**Owner:** chaelyoooo
**Update URL:** https://u.expo.dev/ad439029-6105-4fcd-957e-273591986bb7

## Publishing a New Build (When Native Changes Are Made)

```bash
# Build for Android
eas build --platform android --profile production

# Build for iOS
eas build --platform ios --profile production

# Build for both
eas build --platform all --profile production
```

## Checking Update Status

```bash
# View all published updates
eas update:view

# View specific branch
eas update:list --branch production
```

## Testing Updates Before Publishing

```bash
# Publish to preview branch first
eas update --branch preview --message "Testing fixes"

# Test on your device
# Then publish to production when confirmed working
eas update --branch production --message "Applied fixes"
```

## Rollback (If Something Goes Wrong)

```bash
# List all updates
eas update:list --branch production

# Rollback to a previous update
eas update:rollback --branch production --update-id <update-id>
```

## Best Practices

1. **Test locally first** - Always test in development before publishing
2. **Use descriptive messages** - Help track what each update does
3. **Increment version** - Update version in app.json for major changes
4. **Monitor logs** - Check for errors after publishing updates
5. **Gradual rollout** - Test with preview branch before production

## Common Issues & Solutions

### Issue: Updates not reaching users
**Solution:** Ensure users have internet and restart the app

### Issue: "Runtime version mismatch"
**Solution:** Publish a new build with matching runtime version

### Issue: App crashes after update
**Solution:** Rollback immediately and fix the issue

## Monitoring Updates

Check your Expo dashboard:
https://expo.dev/accounts/chaelyoooo/projects/chammy-florals/updates

## Emergency Hotfix Process

```bash
# 1. Fix the critical bug
# 2. Test locally
# 3. Publish immediately
eas update --branch production --message "HOTFIX: Critical bug fix"
# 4. Monitor crash reports
```

## Version Management

Current version: **1.0.0**

When to increment:
- **Patch (1.0.X)** - Bug fixes, minor tweaks
- **Minor (1.X.0)** - New features, significant updates
- **Major (X.0.0)** - Breaking changes, major redesign

Update in `app.json`:
```json
"version": "1.0.1"
```
