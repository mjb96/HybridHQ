plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.hybridapp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hybridapp"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        // Change this to your hosted URL for remote loading,
        // or leave as "file:///android_asset/www/index.html" to use bundled files.
        buildConfigField("String", "APP_URL", "\"file:///android_asset/www/index.html\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            isDebuggable = true
            // Override with dev server URL during development:
            // buildConfigField("String", "APP_URL", "\"http://10.0.2.2:8080/index.html\"")
        }
        release {
            isMinifyEnabled = true
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

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.health.connect)
    implementation(libs.kotlinx.coroutines.android)
}
