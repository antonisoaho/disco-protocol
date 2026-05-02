export const commonSv = {
  shell: {
    loadingSession: 'Laddar session…',
    appTitle: 'Disc Golf Social',
    signInPrompt: 'Logga in for att fortsatta.',
    nav: {
      home: 'Hem',
      courses: 'Banor',
    },
    signOut: 'Logga ut',
    signOutError: 'Kunde inte logga ut. Försök igen.',
    homeIntro: 'Starta en runda snabbt och besök sedan Banor när du behöver hitta eller redigera layouter.',
    selectedCourse: 'Vald bana:',
    noneYet: 'Ingen ännu',
    browseCourses: 'Bläddra banor',
    coursesIntro:
      'Sök efter banans namn eller stad och använd sortering nära mig när platsdata är tillgänglig.',
    backToRoundSetup: 'Tillbaka till rundinställning',
  },
  scoring: {
    title: 'Rundor och scoring',
    buttons: {
      savedCourse: 'Sparad bana',
      freshInstance: 'Ny instans',
      newRound: 'Ny runda',
      addParticipants: 'Lägg till deltagare',
      addAnonymous: 'Lägg till anonym',
      removeAnonymous: 'Ta bort',
      select: 'Välj',
      selected: 'Vald',
      delete: 'Ta bort',
      markComplete: 'Markera klar',
      retryPromotion: 'Försök igen',
    },
    labels: {
      addAnonymous: 'Lägg till anonym deltagare',
      anonymousParticipant: 'Anonym deltagare',
    },
    placeholders: {
      participantSearch: 'Sök spelare med namn eller uid',
      inviteSearch: 'Sök användare med namn eller uid',
      anonymousName: 'Ange namn',
    },
    messages: {
      participantDefaultsToFriends: 'Visar vänner som standard. Börja skriva för att söka alla.',
      anonymousNameRequired: 'Namn krävs för anonym deltagare.',
      participantAdded: 'Lade till 1 deltagare.',
      participantsAdded: 'Lade till {{count}} deltagare.',
    },
  },
  follow: {
    title: 'Upptäck spelare',
    fallbackSelfLabel: 'Du',
    relationshipCounts: 'Följer {{followingCount}} · Följare {{followerCount}}',
    directoryCount: 'Spelare i katalogen: {{count}}',
    followingList: 'Följer: {{names}}',
    moreNamesEllipsis: '…',
    noFollowingYet: 'Du följer ingen ännu.',
    searchLabel: 'Sök spelare att följa',
    searchPlaceholder: 'Sök på visningsnamn eller uid',
    noResults: 'Inga användare matchar sökningen ännu.',
    missingSearchIndexNotice:
      'Sökningen filtreras just nu lokalt från katalogsnapshoten för inloggade användare. Om katalogen växer bör en dedikerad sökindexering användas.',
    errors: {
      updateRelationshipFallback: 'Kunde inte uppdatera följer-relationen.',
    },
    buttons: {
      saving: 'Sparar…',
      follow: 'Följ',
      unfollow: 'Sluta följa',
    },
  },
} as const
