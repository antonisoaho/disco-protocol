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
} as const
