import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import Guardian from './Guardian'
import Update from './Update'

const Stack = createNativeStackNavigator()

export default function GuardianNavigator() {
    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="GuardianMain" component={Guardian} />
            <Stack.Screen name="GuardianUpdate" component={Update} />
        </Stack.Navigator>
    )
}