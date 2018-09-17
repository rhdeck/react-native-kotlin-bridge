# react-native-kotlin-bridge

Utility for writing helper Kotlin and JS code so you can just write your modules

# Usage

```
cd /path/to/my/module
rnkb
```

This will scan your kotlin files, make the JS and the ReactPackage based on exposed (with the `@ReactMethod` attribute) methods and properties. A file called react-kotlin-bridge will be created.

# Watch mode: rnkb --watch

Watches for changes in kt files in your module, and rebuilds the .m bridge on the fly.

```
cd /path/to/my/module
rnkb --watch
```

Active development, currently only helpful for basic native modules. Not yet aware of events or viewmanagers
