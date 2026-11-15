# Pick a module explicitly via DJANGO_SETTINGS_MODULE (config.settings.local / .production / .test).
# Importing one here would load base.py before test.py can pin its overrides, pointing tests at the real database.
