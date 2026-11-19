import { useRef } from 'react'
import { isProjectLive } from '../data/defaultPortfolio.js'
import { useMasonryGrid } from '../hooks/useMasonryGrid.js'
import { ProjectSitePreview } from './ProjectPreview.jsx'

export function ProjectsGrid({ projects, isPreviewModalOpen, onOpenPreview }) {
  const gridRef = useRef(null)

  useMasonryGrid({
    gridRef,
    cardSelector: ':scope > .project-card',
    gapCssVar: '--projects-gap',
    defaultGap: 18,
    items: projects,
  })

  return (
    <div ref={gridRef} className="projects-grid">
      {projects.map((project) => {
        const liveUrl = project.liveUrl || project.url || null
        const isLive = isProjectLive(project)
        const showPreview = Boolean(liveUrl) && project.showPreview !== false

        return (
          <article key={project.id} className="project-card">
            <div className="project-top">
              <p className="project-number">{project.number}</p>

              <span
                className={`project-status${isLive ? ' status-live' : ''}`}
              >
                {project.status}
              </span>
            </div>

            {project.logo?.src && (
              <div className="project-logo">
                <img
                  src={project.logo.src}
                  alt={project.logo.alt || `${project.title} logo`}
                />
              </div>
            )}

            <h3>{project.title}</h3>

            {showPreview && (
              <ProjectSitePreview
                title={project.title}
                url={liveUrl}
                isPaused={isPreviewModalOpen}
                onExpand={(triggerEl) =>
                  onOpenPreview({ ...project, liveUrl, isLive }, triggerEl)
                }
              />
            )}

            <p>{project.description}</p>

            {Array.isArray(project.tags) && project.tags.length > 0 && (
              <div className="project-tags">
                {project.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            )}

            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noreferrer"
                className="fixroom-live-link"
                aria-label={
                  project.liveAriaLabel || `Open ${project.title} live project`
                }
              >
                <span>{project.liveLabel || 'VIEW LIVE PROJECT'}</span>

                <span className="fixroom-live-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            ) : (
              project.developmentNote && (
                <p className="project-development-note">
                  {project.developmentNote}
                </p>
              )
            )}
          </article>
        )
      })}
    </div>
  )
}
