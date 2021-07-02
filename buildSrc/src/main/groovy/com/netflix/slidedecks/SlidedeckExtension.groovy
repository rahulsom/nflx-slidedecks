package com.netflix.slidedecks

import groovy.json.JsonBuilder
import org.gradle.api.Project
import org.gradle.api.provider.Property

import java.time.LocalDate

class SlidedeckExtension {
  private Project project

  SlidedeckExtension(Project project) {
    this.project = project
  }

  Property<LocalDate> date = project.objects.property(LocalDate)
  Property<String> title = project.objects.property(String)
  Property<String> venue = project.objects.property(String)

  String toJson() {
    new JsonBuilder([
        date : date.getOrNull()?.toString(),
        title: title.getOrNull()?.toString(),
        venue: venue.getOrNull()?.toString(),
    ]).toPrettyString()
  }
}
