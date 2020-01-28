import React from 'react'
import { useUser } from '@fs/zion-user'
import { useTranslation } from 'react-i18next'
import { Cell, Grid, HeaderBlock, List, ListItem, PersonBlock, Separator, CollapsableListItem } from '@fs/zion-ui'
import { NoticeLoading } from '@fs/zion-icon'
import ErrorBoundary from '@fs/zion-error-boundary'
import usePersonDetails from './personDetailsService'
import usePersonPortrait from './portraitService'
import ResponsiveDebug from './ResponsiveDebug'

export default function UserInfoPage() {
  const { t } = useTranslation()
  const user = useUser()

  if (!user.signedIn) return <NoticeLoading />

  return (
    <>
      <Separator size="sm" />
      <Grid>
        <Cell>
          <HeaderBlock
            size="lg"
            heading={t('welcome.message.name', 'Welcome to FamilySearch, {name}', { name: user.displayName })}
          />
          <Separator size="sm" />
        </Cell>
        <Cell>
          <ErrorBoundary>
            <UserInfo user={user} />
          </ErrorBoundary>
        </Cell>
      </Grid>
      <ResponsiveDebug />
    </>
  )
}

const UserInfo = React.memo(({ user }) => {
  const [{ status: portraitStatus, portraitUrl }] = usePersonPortrait(user.personId)
  const [{ status: detailsStatus, details }] = usePersonDetails(user.personId)

  if (!(portraitStatus === 'SUCCESS' && detailsStatus === 'SUCCESS')) return <NoticeLoading />
  const sex = user.gender ? user.gender.toLowerCase() : 'unknown'

  return (
    <Grid>
      <Cell>
        <PersonBlock
          size="lg"
          avatarProps={{
            src: portraitUrl || '',
            sex,
          }}
          name={user.displayName}
          details={`${user.personId}`}
        />
      </Cell>
      <Cell>
        <List>
          <CollapsableListItem primaryText="Identification">
            <ListItem primaryText="CIS" metaText={user.cisId} />
            <ListItem primaryText="PID" metaText={user.personId} />
            <ListItem primaryText="Family Name" metaText={details.familyName} />
            <ListItem primaryText="Full Bame" metaText={details.fullName} />
            <ListItem primaryText="Display Name" metaText={user.displayName} />
            <ListItem primaryText="Contact Name" metaText={user.contactName} />
            <ListItem primaryText="Gender" metaText={user.gender} />
          </CollapsableListItem>
          <CollapsableListItem primaryText="Birth">
            <ListItem primaryText="Lifespan" metaText={details.summary.lifespan} />
            <ListItem primaryText="Date of Birth" metaText={details.summary.lifespanBegin.date.original} />
            <ListItem primaryText="Place of Birth" metaText={details.summary.lifespanBegin.place.original} />
          </CollapsableListItem>
          <CollapsableListItem primaryText="Stats">
            <ListItem primaryText="Contributor Count" metaText={details.personStats.contributorCount} />
            <ListItem primaryText="User Change Count" metaText={details.personStats.userChangeCount} />
          </CollapsableListItem>
        </List>
      </Cell>
    </Grid>
  )
})