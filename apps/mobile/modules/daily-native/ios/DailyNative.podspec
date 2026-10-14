Pod::Spec.new do |s|
  s.name           = 'DailyNative'
  s.version        = '1.0.0'
  s.summary        = 'Daily for iPhone: the Sunny Live Activity'
  s.author         = 'Daily'
  s.homepage       = 'https://github.com/aaronalexS'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.swift'
end
