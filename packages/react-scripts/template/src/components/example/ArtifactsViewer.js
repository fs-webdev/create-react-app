import React from 'react'
import { colors } from '@fs/zion-ui'
import { css } from '@emotion/core'
import axios from '@fs/zion-axios'
import LazyImage from './LazyImage'
import Banner from './Banner'

const artifactsCss = css`
  margin: 0 -24px;
`

const ArtifactsViewer = ({ user: { cisId } }) => {
  // Use our custom hook
  const [{ loading, artifacts, photos, error }] = useArtifacts(cisId)

  function renderLoading() {
    return <Banner color={colors.background.primary} message="Finding some fantastic photos of your ancestors ..." />
  }

  function renderError() {
    return <Banner color={colors.feedback.danger.accent2} message="Darn it, something went wrong!" />
  }

  function renderNoArtifacts() {
    return (
      <Banner
        color={colors.feedback.warning.accent2}
        message="Sorry but your ancestors must have been camera shy, we couldn't find any photos"
      />
    )
  }

  function renderArtifacts() {
    if (!artifacts || !artifacts.length) return renderNoArtifacts()
    return (
      <div css={artifactsCss}>
        <PhotoViewer photos={photos} />
      </div>
    )
  }

  if (error) return renderError()
  return loading ? renderLoading() : renderArtifacts()
}

const photoViewerCss = css`
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  background: ${colors.background.primary};
`
const viewerImageCss = css`
  height: 100%;
  margin-right: 8px;

  &.loaded:not(.has-error) {
    animation: loaded 300ms ease-in-out;
  }
  &.has-error {
  }
  @keyframes loaded {
    0% {
      opacity: 0.1;
    }
    100% {
      opacity: 1;
    }
  }
`

const PhotoViewer = ({ photos, height = 250 }) => {
  const handleOnError = (event) => {
    // event.target.src = `https://dummyimage.com/${height}/e0e2e2/000.png&text=unable+to+load+:(`
    // event.target.src = `https://placekitten.com/250`
    event.target.src = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPoAAAD6BAMAAAB6wkcOAAAAG1BMVEXg4uIAAACMjY04ODioqakcHBxwcXHExcVUVFRmx425AAAACXBIWXMAAA7EAAAOxAGVKw4bAAACfUlEQVR4nO3Vz0/aYByA8a9Q+3JcdNMdGzbcjk6s7NjNNVyVInhkcRqP7abBI9PM8Gfvfd+WFoQQQRIS83wSxktXePrj7asIAAAAAAAAAAAAAAAAAAAAAAAAAAAAXgdn4m2WYN4mZ/CiejLxNoN6M71tNx/dxiuvnzy/3n5RfFZd7Y7vMLfuDtZZT5a68Mp+qx+brB3ben+i3o+LurL/lf0bF/Xrhaof7CssRac9uTuNtmNJ3MgfpPXL+rkJlq52rn7pT1EUjOrumX8o6t+7Lw09jvxeWr8XOVimfhGrlvyOxT2RZCjqwdbLA3H3TX1vp/pRKg1x2qP6QyxhoD7pQ7Lj67TeGZ9+z69/209HIm8l0Se+GZh6TbJzsVc+zF6m7uiHwLEPwkZg3iujujqZKjyjHme/LId23uiZm6Tlz3n9UexR2XqlJ9mzVQ7MOJ+WzjJ1U9Y59f2qZW+4/pEk/fnjvG4+2aqu26PQh3Ozd+mVPSkueGl/6bry76vj9ffD4dDP6+Zln2Zd3zCT8Vr+nFdrnj2SFZz7rWeudlHf+qHNqeuJKuWV1c2dfXrlJa9PX3nzaXPyys9aieYw3YusrmeZ2hqbdUf5Xvms86SYdS3TTbyJWbfgMm/mWlSce2XryRNX1KefONP965mxm682i611ekUJR+dei9VQ3/dHUV/T1UYvZE27l77BM1abUlfuHjy72nTtbp15f5hnUX69cZzV3W2/dzC50voNu1dYb5tPZ8GorvfRW37WO/rqm5U2r9t7skC+WYyd7M9IMNpwE48PbuKnX2uOfy3d3l2ovmrhWuulwVrzAAAAAAAAAAAAAAAAAAAAAAAAAIDX5z8rj3rC/TV6CAAAAABJRU5ErkJggg==`
  }

  return (
    <div css={photoViewerCss} style={{ height }}>
      {photos.map((photo) => (
        <LazyImage css={viewerImageCss} key={photo.id} src={photo.url} alt={photo.alt} handleOnError={handleOnError} />
      ))}
    </div>
  )
}

export default React.memo(ArtifactsViewer)

// Custom hook for fetching artifacts from the the memory service
function useArtifacts(cisId) {
  // Handles dispatched actions
  // Take an action type, applies state changes and returns new state
  const reducer = (state, { type, ...data }) => {
    switch (type) {
      case 'LOADING':
        return { ...state, loading: true }
      case 'SUCCESS': {
        const { artifacts } = data
        const photos = artifacts
          .filter((arts) => arts.featuredImages.length > 0)
          .map((a) => ({
            id: a.featuredImages[0].apid,
            url: a.featuredImages[0].thumbUrl,
            alt: a.featuredImages[0].title,
          }))

        // Remove duplicates.
        const photoSet = Array.from(new Set(photos.map((p) => p.id))).map((id) => photos.find((p) => p.id === id))
        return { ...state, loading: false, artifacts, photos: photoSet }
      }
      case 'ERROR':
        return { ...state, loading: false, error: data.error }
      default:
        throw new Error(`Unknown action type: ${type}`)
    }
  }

  const [state, dispatch] = React.useReducer(reducer, { loading: true })

  React.useEffect(() => {
    // Dispatch action to update loading state
    dispatch({ type: 'LOADING' })

    // Initiate API call
    axios
      .get(
        `/service/memories/presentation/patrons/${cisId}/persons?numTaggedPersonArtifacts=3&includeTaggedPersons=true&includeEmptyPersons=false&includeHistory=false`
      )
      .then((response) => response.data.filter((a) => a.featuredImages && a.featuredImages.length > 0))
      .then((artifacts) => {
        // Success!  Dispatch action with results
        dispatch({ type: 'SUCCESS', artifacts })
      })
      .catch((error) => dispatch({ type: 'ERROR', error })) // Dispatch Error, update state
  }, [cisId])

  return [state]
}
