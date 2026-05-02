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
      select: 'Välj',
      selected: 'Vald',
      delete: 'Ta bort',
      markComplete: 'Markera klar',
      retryPromotion: 'Försök igen',
    },
  },
} as const
