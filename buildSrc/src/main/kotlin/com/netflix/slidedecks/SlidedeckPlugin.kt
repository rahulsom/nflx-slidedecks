package com.netflix.slidedecks

import org.asciidoctor.gradle.jvm.AsciidoctorJExtension
import org.asciidoctor.gradle.jvm.slides.AsciidoctorJRevealJSTask
import org.asciidoctor.gradle.jvm.slides.AsciidoctorRevealJSPlugin
import org.asciidoctor.gradle.jvm.slides.RevealJSExtension
import org.asciidoctor.gradle.slides.export.decktape.AsciidoctorDeckTapePlugin
import org.asciidoctor.gradle.slides.export.decktape.DeckTapeTask
import org.gradle.api.Action
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.plugins.ExtensionAware

class SlidedeckPlugin : Plugin<Project> {
  override fun apply(project: Project) {
    val extension = project.extensions.create("slidedeck", SlidedeckExtension::class.java, project)
    if (!extension.theme.isPresent) {
      extension.theme.set("netflix")
    }
    project.plugins.apply(AsciidoctorDeckTapePlugin::class.java)
    project.plugins.apply(AsciidoctorRevealJSPlugin::class.java)

    project.repositories.mavenCentral()
    val repositoriesInternal = project.repositories as ExtensionAware
    repositoriesInternal.extensions.configure(com.github.jrubygradle.api.core.RepositoryHandlerExtension::class.java) {
      it.gems()
    }
    project.extensions.findByType<RevealJSExtension>(RevealJSExtension::class.java)!!.apply {
      version = "3.1.0"
      templateGitHub(Action {
        it.setOrganisation("hakimel")
        it.setRepository("reveal.js")
        it.setTag("3.9.1")
      })
    }
    project.extensions.findByType(AsciidoctorJExtension::class.java)!!.apply {
      modules {
        it.diagram.use()
      }
      attributes(mapOf("includedir" to "${project.projectDir}/src/docs/asciidoc"))
    }
    project.tasks.withType(AsciidoctorJRevealJSTask::class.java).configureEach {
      it.revealjsOptions { o ->
        o.setControls(false)
        o.setOverviewMode(true)
        o.setProgressBar(true)
        o.setPushToHistory(true)
        o.setCustomThemeLocation("build/sass/${extension.theme.get()}.css")
        o.setVerticalCenter(false)
      }
    }
    project.tasks.withType(DeckTapeTask::class.java).configureEach {
      it.height = 1050
      it.width = 1600
      it.loadPause = 10_000
      it.chromeArgs("--font-render-hinting=none", "--disable-remote-fonts")
    }
    project.tasks.create("copyStyles") {
      it.dependsOn(":stylesheet:sassCompile")
      val rootDir = project.rootDir
      val buildDir = project.buildDir
      it.doLast {
        project.copy {
          it.from("${rootDir}/stylesheet/build/sass")
          it.into("build/sass")
        }
        project.copy {
          it.from("${rootDir}/stylesheet/src/main/sass")
          it.into("${buildDir}/docs/asciidocRevealJs/style")
        }
        project.copy {
          it.from("${rootDir}/stylesheet/build/docs/asciidocRevealJs/package")
          it.into("${buildDir}/docs/asciidocRevealJs/package")
        }
      }
      it.inputs.dir("${rootDir}/stylesheet/build/sass")
      it.inputs.dir("${rootDir}/stylesheet/src/main/sass")
      it.outputs.dir("build/sass")
      it.outputs.dir("${buildDir}/docs/asciidocRevealJs/style")
    }
    project.tasks.findByName("asciidoctorRevealJs")!!.apply {
      dependsOn("copyStyles")
      doLast {
        println("Open ${project.buildDir}/docs/asciidocRevealJs/index.html")
      }
    }
    project.tasks.create("copyToPages") {
      val rootDir = project.rootDir
      it.doLast {
        project.copy {
          it.from("build/docs/asciidocRevealJs")
          it.into("${rootDir}/pages/build/staging/${project.name}/html")
        }
        project.copy {
          it.from("build/docs/asciidocRevealJsExport")
          it.into("${rootDir}/pages/build/staging/${project.name}/pdf")
        }
        project.file("${rootDir}/pages/build/staging/${project.name}").mkdirs()
        project.file("${rootDir}/pages/build/staging/${project.name}/metadata.json")
          .writeText(extension.toJson())
      }
      it.inputs.property("slidedeckExtension", extension.toJson())
      it.inputs.dir("build/docs/asciidocRevealJs")
      it.inputs.dir("build/docs/asciidocRevealJsExport")

      it.outputs.file("${rootDir}/pages/build/staging/${project.name}/metadata.json")
      it.outputs.dir("${rootDir}/pages/build/staging/${project.name}/html")
      it.outputs.dir("${rootDir}/pages/build/staging/${project.name}/pdf")

      it.dependsOn("asciidoctorRevealJsExport")
    }

    project.tasks.getByName("build").dependsOn("asciidoctorRevealJsExport", "copyToPages")
    project.tasks.getByName("asciidoctorRevealJs").dependsOn("asciidoctorGemsPrepare")
    project.tasks.getByPath(":pages:buildIndex").dependsOn(":${project.name}:copyToPages")
    project.tasks.getByPath(":pages:buildIndex").inputs.file("${project.rootDir}/pages/build/staging/${project.name}/metadata.json")
  }
}
