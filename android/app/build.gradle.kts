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
        versionCode = 1
        versionName = "1.0.0"

        // WebViewAssetLoader origin. Override in debug with a dev-server URL if needed:
        // buildConfigField("String", "APP_URL", "\"http://10.0.2.2:8080/index.html\"")
        buildConfigField("String", "APP_URL", "\"https://appassets.androidplatform.net/assets/www/index.html\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            isDebuggable = true
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
    implementation(libs.health.connect)
    implementation(libs.kotlinx.coroutines.android)
}
