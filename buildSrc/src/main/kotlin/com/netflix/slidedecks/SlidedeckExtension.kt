package com.netflix.slidedecks

import org.gradle.api.Project
import org.gradle.api.provider.Property
import com.fasterxml.jackson.databind.ObjectMapper
import java.time.LocalDate

open class SlidedeckExtension(project: Project) {
    fun toJson(): String {
        return ObjectMapper().writeValueAsString(mapOf(
            "date" to date.getOrNull().toString(),
            "title" to title.getOrNull().toString(),
            "venue" to venue.getOrNull().toString(),
            "video" to video.getOrNull().toString()
        ))
    }

    val date = project.objects.property<LocalDate>(LocalDate::class.java)
    val title: Property<String> = project.objects.property<String>(String::class.java)
    val venue: Property<String> = project.objects.property<String>(String::class.java)
    val video: Property<String> = project.objects.property<String>(String::class.java)
    val theme: Property<String> = project.objects.property<String>(String::class.java)

}
