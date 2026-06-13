import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.hybridapp"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.hybridapp"
        minSdk = 26
        targetSdk = 36
        // Bump via CI: export VERSION_CODE=$(git rev-list --count HEAD) before the build.
        versionCode = System.getenv("VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = "1.0.0"

        buildConfigField("String", "APP_URL", "\"https://appassets.androidplatform.net/assets/www/index.html\"")
    }

    signingConfigs {
        // Release key supplied via CI environment variables or local.properties.
        // Keys: KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
        // For local overrides add them to android/local.properties (never commit that file).
        create("release") {
            val propFile = rootProject.file("local.properties")
            val props = Properties()
            if (propFile.exists()) props.load(propFile.inputStream())
            fun env(key: String): String? = System.getenv(key) ?: props.getProperty(key)
            storeFile   = env("KEYSTORE_PATH")?.let { file(it) }
            storePassword = env("KEYSTORE_PASSWORD").orEmpty()
            keyAlias    = env("KEY_ALIAS").orEmpty()
            keyPassword = env("KEY_PASSWORD").orEmpty()
        }
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            isDebuggable = true
            // Uncomment to use a local dev server instead of bundled assets:
            // buildConfigField("String", "APP_URL", "\"http://10.0.2.2:8080/index.html\"")
        }
        release {
            isMinifyEnabled = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

// Copy the web app into the bundled assets folder before each build.
tasks.register<Copy>("copyWebAssets") {
    from(rootProject.projectDir.parentFile) {
        include("index.html", "sw.js", "manifest.json", "icon-512.png")
        include("css/**")
        include("js/**")
    }
    into(layout.projectDirectory.dir("src/main/assets/www"))
}

tasks.named("preBuild") {
    dependsOn("copyWebAssets")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.health.connect)
    implementation(libs.kotlinx.coroutines.android)
}
