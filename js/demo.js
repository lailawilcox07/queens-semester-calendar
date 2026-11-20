// Sample Winter 2027 student, for demos. Loaded from the welcome screen.
window.DEMO_PROFILE = {
 "version": 1,
 "setupComplete": true,
 "step": 8,
 "term": {
  "presetId": "W2027",
  "label": "Winter 2027",
  "classesStart": "2027-01-04",
  "classesEnd": "2027-04-05",
  "examStart": "2027-04-09",
  "examEnd": "2027-04-23",
  "breaks": [
   {
    "label": "Reading week",
    "start": "2027-02-15",
    "end": "2027-02-19"
   },
   {
    "label": "Good Friday",
    "start": "2027-03-26",
    "end": "2027-03-26"
   }
  ]
 },
 "courses": [
  {
   "id": "c1",
   "code": "CISC 124",
   "name": "Introduction to Computing Science II",
   "color": 1,
   "meetings": [
    {
     "id": "m1",
     "type": "Lecture",
     "location": "Goodwin 254",
     "slots": [
      {
       "id": "Mon09:30d70x",
       "day": "Mon",
       "start": "09:30",
       "end": "10:30"
      },
      {
       "id": "Wed08:30qj0i",
       "day": "Wed",
       "start": "08:30",
       "end": "09:30"
      },
      {
       "id": "Thu10:30xfeo",
       "day": "Thu",
       "start": "10:30",
       "end": "11:30"
      }
     ]
    },
    {
     "id": "m2",
     "type": "Lab",
     "location": "Goodwin 248",
     "slots": [
      {
       "id": "Thu14:30lab6",
       "day": "Thu",
       "start": "14:30",
       "end": "16:30"
      }
     ]
    }
   ],
   "assessments": [
    {
     "id": "a1",
     "name": "Assignment 1",
     "type": "Assignment",
     "due": "2027-01-29",
     "weight": 10
    },
    {
     "id": "a2",
     "name": "Assignment 2",
     "type": "Assignment",
     "due": "2027-02-26",
     "weight": 10
    },
    {
     "id": "a3",
     "name": "Midterm",
     "type": "Midterm",
     "due": "2027-02-24",
     "weight": 25
    },
    {
     "id": "a4",
     "name": "Assignment 3",
     "type": "Assignment",
     "due": "2027-03-19",
     "weight": 15
    },
    {
     "id": "a5",
     "name": "Final exam",
     "type": "Final exam",
     "due": "",
     "weight": 40,
     "note": "During the April exam period"
    }
   ]
  },
  {
   "id": "c2",
   "code": "MATH 120",
   "name": "Differential and Integral Calculus",
   "color": 2,
   "meetings": [
    {
     "id": "m3",
     "type": "Lecture",
     "location": "Stirling A",
     "slots": [
      {
       "id": "Tue11:30hmk3",
       "day": "Tue",
       "start": "11:30",
       "end": "12:30"
      },
      {
       "id": "Thu12:30mdr8",
       "day": "Thu",
       "start": "12:30",
       "end": "13:30"
      },
      {
       "id": "Fri10:30rtew",
       "day": "Fri",
       "start": "10:30",
       "end": "11:30"
      }
     ]
    },
    {
     "id": "m4",
     "type": "Tutorial",
     "location": "Jeffery 127",
     "slots": [
      {
       "id": "Fri14:30wao1",
       "day": "Fri",
       "start": "14:30",
       "end": "15:30"
      }
     ]
    }
   ],
   "assessments": [
    {
     "id": "b1",
     "name": "Quiz 1",
     "type": "Quiz",
     "due": "2027-01-22",
     "weight": 5
    },
    {
     "id": "b2",
     "name": "Quiz 2",
     "type": "Quiz",
     "due": "2027-02-05",
     "weight": 5
    },
    {
     "id": "b3",
     "name": "Midterm",
     "type": "Midterm",
     "due": "2027-02-26",
     "weight": 30
    },
    {
     "id": "b4",
     "name": "Quiz 3",
     "type": "Quiz",
     "due": "2027-03-12",
     "weight": 5
    },
    {
     "id": "b5",
     "name": "Quiz 4",
     "type": "Quiz",
     "due": "2027-03-26",
     "weight": 5
    },
    {
     "id": "b6",
     "name": "Final exam",
     "type": "Final exam",
     "due": "2027-04-14",
     "weight": 50
    }
   ]
  },
  {
   "id": "c3",
   "code": "PSYC 100",
   "name": "Principles of Psychology",
   "color": 3,
   "meetings": [
    {
     "id": "m5",
     "type": "Lecture",
     "location": "Biosciences Aud",
     "slots": [
      {
       "id": "Mon13:304icc",
       "day": "Mon",
       "start": "13:30",
       "end": "15:00"
      },
      {
       "id": "Wed13:30welg",
       "day": "Wed",
       "start": "13:30",
       "end": "15:00"
      }
     ]
    }
   ],
   "assessments": [
    {
     "id": "p1",
     "name": "Essay proposal",
     "type": "Assignment",
     "due": "2027-02-08",
     "weight": 10
    },
    {
     "id": "p2",
     "name": "Midterm",
     "type": "Midterm",
     "due": "2027-02-22",
     "weight": 30
    },
    {
     "id": "p3",
     "name": "Essay",
     "type": "Project",
     "due": "2027-03-22",
     "weight": 20
    },
    {
     "id": "p4",
     "name": "Final exam",
     "type": "Final exam",
     "due": "",
     "weight": 40
    }
   ]
  }
 ],
 "routine": {
  "wake": "08:00",
  "bed": "23:30",
  "commute": 20,
  "commitments": [
   {
    "id": "k1",
    "label": "Volleyball",
    "commute": 10,
    "slots": [
     {
      "id": "Tue19:00il0e",
      "day": "Tue",
      "start": "19:00",
      "end": "21:00"
     },
     {
      "id": "Sun16:00488o",
      "day": "Sun",
      "start": "16:00",
      "end": "18:00"
     }
    ]
   },
   {
    "id": "k2",
    "label": "Cafe shift",
    "commute": 15,
    "slots": [
     {
      "id": "Sat10:00jp43",
      "day": "Sat",
      "start": "10:00",
      "end": "15:00"
     }
    ]
   }
  ],
  "oneoffs": [
   {
    "id": "o1",
    "label": "Dentist",
    "date": "2027-02-10",
    "start": "16:00",
    "end": "17:00",
    "commute": 15
   }
  ]
 },
 "study": {
  "style": "spread",
  "weeklyHours": 18
 },
 "progress": {
  "done": {},
  "started": {},
  "grades": {}
 }
};
