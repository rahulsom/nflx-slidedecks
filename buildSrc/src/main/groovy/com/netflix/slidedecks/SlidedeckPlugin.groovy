package com.netflix.slidedecks

import org.asciidoctor.gradle.jvm.AsciidoctorJExtension
import org.asciidoctor.gradle.jvm.slides.AsciidoctorJRevealJSTask
import org.asciidoctor.gradle.jvm.slides.AsciidoctorRevealJSPlugin
import org.asciidoctor.gradle.jvm.slides.RevealJSExtension
import org.asciidoctor.gradle.slides.export.decktape.AsciidoctorDeckTapePlugin
import org.asciidoctor.gradle.slides.export.decktape.DeckTapeTask
import org.gradle.api.Plugin
import org.gradle.api.Project

class SlidedeckPlugin implements Plugin<Project> {
  @Override
  void apply(Project project) {
    def extension = project.extensions.create("slidedeck", SlidedeckExtension, project)
    project.plugins.apply(AsciidoctorDeckTapePlugin)
    project.plugins.apply(AsciidoctorRevealJSPlugin)
    project.repositories {
      mavenCentral()
      ruby { gems() }
    }
    project.extensions.findByType(RevealJSExtension).with {
      version = "3.1.0"
      templateGitHub {
        organisation = 'hakimel'
        repository = 'reveal.js'
        tag = '3.9.1'
      }
    }
    project.extensions.findByType(AsciidoctorJExtension).with {
      modules {
        diagram.use()
      }
      attributes 'includedir': "${project.projectDir}/src/docs/asciidoc"
    }
    project.tasks.withType(AsciidoctorJRevealJSTask).configureEach {
      it.revealjsOptions { o ->
        o.controls = false
        overviewMode = true
        progressBar = true
        pushToHistory = true
        customTheme = "build/sass/netflix.css"
        verticalCenter = false
      }
    }
    project.tasks.withType(DeckTapeTask).configureEach {
      height = 1050
      width = 1600
      loadPause = 10_000
      chromeArgs('--font-render-hinting=none')
    }
    project.tasks.create("copyStyles") {
      dependsOn(":stylesheet:sassCompile")
      def rootDir = project.rootDir
      def buildDir = project.buildDir
      doLast {
        project.copy {
          from "${rootDir}/stylesheet/build/sass"
          into "build/sass"
        }
        project.copy {
          from "${rootDir}/stylesheet/src/main/sass"
          into "${buildDir}/docs/asciidocRevealJs/style"
        }
        project.copy {
          from "${rootDir}/stylesheet/build/docs/asciidocRevealJs/package"
          into "${buildDir}/docs/asciidocRevealJs/package"
        }
      }
      inputs.dir("${rootDir}/stylesheet/build/sass")
      inputs.dir("${rootDir}/stylesheet/src/main/sass")
      outputs.dir("build/sass")
      outputs.dir("${buildDir}/docs/asciidocRevealJs/style")
    }
    project.tasks.findByName("asciidoctorRevealJs").with {
      dependsOn('copyStyles')
      doLast {
        println "Open ${project.buildDir}/docs/asciidocRevealJs/index.html"
      }
    }
    project.tasks.create("copyToPages") {
      def rootDir = project.rootDir
      doLast {
        project.copy {
          from "build/docs/asciidocRevealJs"
          into "${rootDir}/pages/build/staging/${project.name}/html"
        }
        project.copy {
          from "build/docs/asciidocRevealJsExport"
          into "${rootDir}/pages/build/staging/${project.name}/pdf"
        }
        project.file("${rootDir}/pages/build/staging/${project.name}").mkdirs()
        project.file("${rootDir}/pages/build/staging/${project.name}/metadata.json").text = extension.toJson()
      }
      inputs.property("slidedeckExtension", extension.toJson())
      outputs.file(project.file("${rootDir}/pages/build/staging/${project.name}/metadata.json"))
      inputs.dir "build/docs/asciidocRevealJs"
      outputs.dir "${rootDir}/pages/build/staging/${project.name}/html"
      inputs.dir "build/docs/asciidocRevealJsExport"
      outputs.dir "${rootDir}/pages/build/staging/${project.name}/pdf"
      dependsOn 'asciidoctorRevealJsExport'
    }

    project.tasks.build.dependsOn('asciidoctorRevealJsExport', 'copyToPages')
    project.tasks.getByPath(':pages:buildIndex').dependsOn(":${project.name}:copyToPages")
  }
}
