import React from 'react'
import { css } from '@emotion/core'
import * as Yup from 'yup'
import {
  Button,
  TextField,
  ZionForm,
  Autosuggest,
  Checkbox,
  colors,
  HeaderBlock,
  InputRow,
  Grid,
  Cell,
  Separator,
  useAtSize,
  useStatusOverlay,
} from '@fs/zion-ui'

// Create a list of options for the autosuggest form element
const emotions = ['joy', 'surprise', 'glee', 'astonishment', 'thirst', 'excitement']

const emotionOptions = emotions.map((emotion, idx) => ({
  id: idx,
  key: idx,
  primaryText: emotion,
}))

const defaultValues = {
  adjective1: 'inspiring',
  pluralNoun1: 'experiences',
  emotion1: emotionOptions[0],
  pluralNoun2: 'people',
  pluralNoun3: 'families',
  verb1: 'discover',
  verb2: 'gather',
  verb3: 'connect',
  timePeriod1: 'future',
  debug: false,
}

// Yup is a 3rd party library for validating
// objects. It has a similar api to prop-types.
// Docs here: https://www.npmjs.com/package/yup
const validationSchema = Yup.object().shape({
  adjective1: Yup.string()
    .matches(/ing$/, 'Must end with "ing"')
    .required('Required'),
  pluralNoun3: Yup.string()
    .min(3)
    .max(10)
    .required('Required'),

  pluralNoun1: Yup.string().required('Required'),
  emotion1: Yup.string()
    .required('Required')
    .nullable(),
  pluralNoun2: Yup.string().required('Required'),
  verb1: Yup.string().required('Required'),
  verb2: Yup.string().required('Required'),
  verb3: Yup.string().required('Required'),
  timePeriod1: Yup.string().required('Required'),
})

const PurposeStatementGenerator = () => {
  const [data, setData] = React.useState(defaultValues)
  const atSize = useAtSize()
  const showStatusOverlay = useStatusOverlay()

  const handleFormSubmit = (formData) => {
    setData(formData)
    showStatusOverlay({
      type: 'success',
      message: 'Way to go!',
    })
  }

  const handleStartOver = () => setData(defaultValues)

  return (
    <Grid>
      <Cell columns={atSize({ lg: 7, sm: 12 })}>
        <ZionForm
          onSubmit={handleFormSubmit}
          initialValues={defaultValues}
          validationSchema={validationSchema}
          onReset={handleStartOver}
          mustTouchToError
        >
          {({ handleReset, ...props }) => (
            <Grid horizontalGutters={false}>
              <Cell>
                <HeaderBlock
                  heading="Purpose Statement Generator"
                  size="md"
                  overline="Zion Form Example"
                  subHeading="Use the following form to generate a custom purpose statement."
                />
                <Separator size="xs" />
              </Cell>
              <Cell columns={atSize({ lg: 2, md: 4, sm: 6 })}>
                <TextField label="Adjective ending *ing" name="adjective1" placeholder="inspiring" />
              </Cell>
              <Cell columns={atSize({ lg: 2, md: 4, sm: 6 })}>
                <TextField label="Plural Noun" name="pluralNoun1" placeholder="experiences" />
              </Cell>
              <Cell columns={atSize({ lg: 3, md: 4, sm: 6 })}>
                <Autosuggest
                  label="Emotion"
                  name="emotion1"
                  placeholder="joy"
                  suggestions={emotionOptions}
                  handleInput
                  highlightMatchingText
                />
              </Cell>
              <Cell columns={atSize({ lg: 3, md: 4, sm: 6 })}>
                <TextField label="Plural Noun" name="pluralNoun2" placeholder="people" />
              </Cell>
              <Cell columns={atSize({ lg: 2, md: 4, sm: 6 })}>
                <TextField label="Verb" name="verb1" placeholder="discover" />
              </Cell>
              <Cell columns={atSize({ lg: 2, md: 4, sm: 6 })}>
                <TextField label="Verb" name="verb2" placeholder="gather" />
              </Cell>
              <Cell columns={atSize({ lg: 2, md: 4, sm: 6 })}>
                <TextField label="Verb" name="verb3" placeholder="connect" />
              </Cell>
              <Cell columns={atSize({ lg: 2, md: 4, sm: 6 })}>
                <TextField label="Plural Noun" name="pluralNoun3" placeholder="families" />
              </Cell>
              <Cell columns={atSize({ lg: 3, md: 4, sm: 6 })}>
                <TextField label="Time Period " name="timePeriod1" placeholder="future" />
              </Cell>
              <Cell>
                <InputRow>
                  <Button type="submit" emphasis="high">
                    Submit
                  </Button>
                  <Button onClick={handleReset}>Reset</Button>
                  <Checkbox label="Debug Form" name="debug" />
                </InputRow>
              </Cell>
              <Cell columns={atSize({ lg: 3, md: 4, sm: 6 })}>
                {props.values.debug && (
                  <pre>{JSON.stringify({ errors: props.errors, values: props.values }, null, 2)}</pre>
                )}
              </Cell>
            </Grid>
          )}
        </ZionForm>
      </Cell>
      <Cell columns={atSize({ lg: 5, sm: 12 })}>
        <PurposeStatement data={data} />
      </Cell>
    </Grid>
  )
}

const purposeStatementCss = css`
  height: 100%;
  color: ${colors.feedback.confirmation.accent};
  background-color: ${colors.background.secondary};
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  padding: 50px;
  text-align: center;
`
const PurposeStatement = ({
  data: { adjective1, pluralNoun1, emotion1, pluralNoun2, pluralNoun3, verb1, verb2, verb3, timePeriod1 },
}) => {
  const purposeStatement = `We create ${adjective1} ${pluralNoun1} that bring ${emotion1.primaryText} to all ${pluralNoun2} as they ${verb1}, ${verb2} and ${verb3} their ${pluralNoun3} — past, present and ${timePeriod1}.`

  return (
    <div css={purposeStatementCss}>
      <HeaderBlock size="md" heading={purposeStatement} />
    </div>
  )
}

// Use React.memo() to keep our component from re-rendering if the props haven't changed
// https://reactjs.org/docs/react-api.html#reactmemo
// https://egghead.io/lessons/react-prevent-unnecessary-component-rerenders-with-react-memo
export default React.memo(PurposeStatementGenerator)
