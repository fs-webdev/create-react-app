import React from 'react'
import { Card, CardActions, CardContent, CardMedia } from '@fs/zion-ui'
import IconButton from '@fs/zion-ui/icon-button'
import { SocialLike, ArrowChevron } from '@fs/zion-icon'
import axios from '@fs/zion-axios'

// Custom hook for fetching artifacts from the the memory service
const useArtifacts = ({ cisId }) => {
  // Handles dispatched actions
  // Take an action type, applies state changes and returns new state
  const reducer = (state, { type, ...data }) => {
    switch (type) {
      case 'LOADING':
        return { ...state, loading: true }
      case 'SUCCESS': {
        const { artifacts } = data
        return { ...state, loading: false, artifacts }
      }
      case 'ERROR':
        return { ...state, loading: false, error: data.error }
      default:
        throw new Error(`Unknown action type: ${type}`)
    }
  }

  const [state, dispatch] = React.useReducer(reducer, { loading: true })

  // Fetch artifacts from memory service
  React.useEffect(() => {
    // Dispatch action to update loading state
    dispatch({ type: 'LOADING' })

    // Initiate API call
    axios
      .get(
        `/service/memories/presentation/patrons/${cisId}/persons?numTaggedPersonArtifacts=3&includeTaggedPersons=true&includeEmptyPersons=false&includeHistory=false`
      )
      .then(response => response.data.filter(a => a.featuredImages && a.featuredImages.length > 0))
      .then(artifacts => {
        // Success!  Dispatch action with results
        dispatch({ type: 'SUCCESS', artifacts })
      })
      .catch(error => dispatch({ type: 'ERROR', error })) // Dispatch Error, update state
  }, [cisId])

  return [state]
}

const ArtifactsCard = ({ user, likeButtonPressed }) => {
  // Initiate state variables
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [liked, setLiked] = React.useState([])

  // Use our custom hook
  const [{ loading, artifacts, error }] = useArtifacts(user)

  // Event handlers
  const handleNextClick = () => {
    setSelectedIndex(currentIndex => currentIndex + 1)
  }

  const handlePreviousClick = () => {
    setSelectedIndex(currentIndex => currentIndex - 1)
  }

  const handleToggleLiked = () => {
    // Notify parent that the like button was pressed
    likeButtonPressed()

    // Update internal state
    setLiked(current => {
      current[selectedIndex] = !current[selectedIndex]
      return current
    })
  }

  // Helper functions for rendering
  function renderLoading() {
    return <CardContent>Loading ... </CardContent>
  }

  function renderError() {
    return <CardContent>An error has occured</CardContent>
  }

  function renderArtifacts() {
    const selectedArtifact = artifacts ? artifacts[selectedIndex] : null
    const featuredImage = selectedArtifact ? selectedArtifact.featuredImages[0] : null
    return (
      <>
        <CardMedia
          height="var(--cell-width)"
          image={featuredImage.thumbSquareUrl}
          title={featuredImage.title}
        />
        <CardContent>
          <h3>{selectedArtifact.name}</h3>
        </CardContent>
        <CardActions>
          <IconButton
            color={liked[selectedIndex] ? 'secondary' : 'default'}
            onClick={handleToggleLiked}
          >
            <SocialLike />
          </IconButton>
          <IconButton onClick={handlePreviousClick} disabled={selectedIndex === 0}>
            <ArrowChevron direction="left" />
          </IconButton>
          <IconButton onClick={handleNextClick} disabled={selectedIndex + 1 === artifacts.length}>
            <ArrowChevron />
          </IconButton>
        </CardActions>
      </>
    )
  }

  return (
    <Card>
      {error && renderError()}
      {loading ? renderLoading() : renderArtifacts()}
    </Card>
  )
}

export default ArtifactsCard