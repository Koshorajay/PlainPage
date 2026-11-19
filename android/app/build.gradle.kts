import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.gms.google-services")
}

// App Check debug token: read from android/appcheck.properties (never committed).
// The App Check debug provider picks it up from this string resource.
val appCheckProps = Properties().apply {
    val file = rootProject.file("appcheck.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

android {
    namespace = "app.plainpage"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.plainpage"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        debug {
            resValue("string", "firebase_app_check_debug_token", appCheckProps.getProperty("appCheckDebugToken", ""))
        }
        release {
            isMinifyEnabled = false
            resValue("string", "firebase_app_check_debug_token", "")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/INDEX.LIST", "/META-INF/DEPENDENCIES", "/META-INF/io.netty.versions.properties")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        // Firebase AI Logic's hybrid (on-device) API is a public preview.
        optIn.add("com.google.firebase.ai.type.PublicPreviewAPI")
    }
}

dependencies {
    // Firebase AI Logic with hybrid (on-device + cloud) inference
    implementation("com.google.firebase:firebase-ai:18.2.0")
    implementation("com.google.firebase:firebase-ai-ondevice:16.0.0-beta08")
    // App Check (debug provider; accepted for hackathon submissions) and Remote Config
    implementation("com.google.firebase:firebase-appcheck:20.0.0")
    implementation("com.google.firebase:firebase-appcheck-debug:20.1.0")
    implementation("com.google.firebase:firebase-config:24.0.1")

    implementation(platform("androidx.compose:compose-bom:2025.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
}
